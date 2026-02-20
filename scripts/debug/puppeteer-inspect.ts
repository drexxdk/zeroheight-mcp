#!/usr/bin/env tsx

import fs from "fs";
import path from "path";
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import { HTTPRequest, HTTPResponse, Page } from "puppeteer";
import {
  launchBrowser as sharedLaunchBrowser,
  attachDefaultInterception,
} from "../../src/tools/scraper/utils/puppeteer";

type ReqRecord = {
  id: number;
  url: string;
  method: string;
  resourceType: string;
  status?: number | null;
  failure?: string | null;
  headers?: Record<string, string | string[]>;
  responseSize?: number | null;
  timestamp: number;
};

function parseBlockArg(arg?: string) {
  if (!arg) return new Set<string>();
  return new Set(
    arg
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error(
      "Usage: npx tsx scripts/debug/puppeteer-inspect.ts <url> [--block=resourceTypes]",
    );
    process.exit(1);
  }

  const url = argv[0];
  const blockArg = argv.find((a) => a.startsWith("--block="));
  const blockSet = parseBlockArg(blockArg?.split("=")[1]);
  const allowArg = argv.find((a) => a.startsWith("--allow="));
  const allowSet = parseBlockArg(allowArg?.split("=")[1]);

  const outDir = path.join(process.cwd(), "logs", "puppeteer-inspect");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const runTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(outDir, `report-${runTimestamp}.json`);
  const screenshotPath = path.join(outDir, `screenshot-${runTimestamp}.png`);
  const harPath = path.join(outDir, `trace-${runTimestamp}.har`);

  const browser = await sharedLaunchBrowser();
  const page = await browser.newPage();

  const records: ReqRecord[] = [];
  let counter = 0;
  let blockedCount = 0;
  let totalBytes = 0;

  // Use the shared interception helper and record decisions via onRequest
  await attachDefaultInterception(page, {
    allow: allowSet,
    block: blockSet,
    onRequest: (
      req: HTTPRequest,
      decision: "blocked" | "continued",
      reason?: string,
    ) => {
      const id = ++counter;
      const reqUrl = req.url();
      const rec: ReqRecord = {
        id,
        url: reqUrl,
        method: req.method(),
        resourceType: req.resourceType(),
        timestamp: Date.now(),
      };
      if (decision === "blocked") {
        blockedCount += 1;
        rec.failure = reason ?? "blocked";
      }
      records.push(rec);
    },
  });

  page.on("requestfailed", (req: HTTPRequest) => {
    const rec = records.find((r) => r.url === req.url());
    if (rec) rec.failure = req.failure()?.errorText ?? "failed";
  });

  page.on("response", async (res: HTTPResponse) => {
    try {
      const req = res.request();
      const rec = records.find((r) => r.url === req.url());
      if (!rec) return;
      rec.status = res.status();
      rec.headers = res.headers();
      const len = res.headers()["content-length"];
      if (len) {
        let n = NaN;
        if (typeof len === "string") n = parseInt(len, 10);
        else if (typeof len === "number") n = Math.floor(len);
        if (!Number.isNaN(n)) {
          rec.responseSize = n;
          totalBytes += n;
        }
      } else {
        // attempt to fetch buffer size for same-origin responses
        try {
          const buffer = await res.buffer();
          rec.responseSize = buffer.length;
          totalBytes += buffer.length;
        } catch {
          rec.responseSize = null;
        }
      }
    } catch {
      // ignore
    }
  });

  console.log(
    `Navigating to ${url} (blocking: ${[...blockSet].join(",") || "none"})`,
  );
  // try to load an optional HAR recorder
  let harRecorder: {
    start?: (opts?: { path?: string }) => Promise<void>;
    stop?: () => Promise<void>;
  } | null = null;
  try {
    const HarModuleUnknown: unknown = await import("puppeteer-har");
    const { isRecord } = await import("../../src/utils/common/typeGuards");
    type PuppeteerHar = {
      start?: (opts?: { path?: string }) => Promise<void>;
      stop?: () => Promise<void>;
    };
    // Avoid `as unknown` by narrowing the module shape with specific constructor types
    type PuppeteerHarCtor = new (p: Page) => PuppeteerHar;

    if (typeof HarModuleUnknown === "function") {
      const Ctor = HarModuleUnknown as PuppeteerHarCtor;
      harRecorder = new Ctor(page);
    } else if (isRecord(HarModuleUnknown)) {
      const mod = HarModuleUnknown as { PuppeteerHar?: unknown };
      if (typeof mod.PuppeteerHar === "function") {
        const Ctor = mod.PuppeteerHar as PuppeteerHarCtor;
        harRecorder = new Ctor(page);
      }
    }
  } catch {
    harRecorder = null;
  }

  try {
    if (harRecorder && harRecorder.start) {
      await harRecorder.start({ path: harPath });
    }
  } catch {
    // ignore har start failures
  }

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    // Attempt to login using project password if available
    try {
      const cfg = await import("../../src/utils/config");
      const { tryLogin } =
        await import("../../src/utils/common/scraperHelpers");
      const password =
        typeof cfg.ZEROHEIGHT_PROJECT_PASSWORD === "string"
          ? cfg.ZEROHEIGHT_PROJECT_PASSWORD
          : undefined;
      if (password) {
        await tryLogin({ page, password });
        console.log("Login attempt complete (inspector)");
      }
    } catch (e) {
      // Non-fatal: continue even if login helper isn't available
      console.warn(
        "Login attempt skipped or failed:",
        e instanceof Error ? e.message : e,
      );
    }
  } catch (e) {
    console.error("Navigation failed:", e instanceof Error ? e.message : e);
  }

  try {
    if (harRecorder && harRecorder.stop) await harRecorder.stop();
  } catch {
    // ignore
  }

  // give a short grace period for late responses
  await new Promise((res) => setTimeout(res, 1000));

  const summary = {
    url,
    blocked: blockedCount,
    totalRequests: records.length,
    totalBytes,
    blockedTypes: [...blockSet],
    records,
  };

  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2), "utf8");
  await page
    .screenshot({ path: screenshotPath, fullPage: true })
    .catch(() => {});

  // Attempt to write HAR if the puppeteer-har module is available and recording was started
  try {
    // if a har file was created by the recorder earlier, leave it; else try to generate via optional helper
    // (the HAR recorder is started/stopped around navigation when available)
  } catch {
    // ignore
  }

  console.log(`Report written: ${reportPath}`);
  console.log(`Screenshot written: ${screenshotPath}`);
  console.log(
    `Requests: ${records.length}, blocked: ${blockedCount}, bytes: ${totalBytes}`,
  );

  await browser.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
