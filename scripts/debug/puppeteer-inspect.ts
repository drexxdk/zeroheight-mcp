#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import puppeteer, { HTTPRequest, HTTPResponse, Page } from "puppeteer";

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

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setRequestInterception(true);

  const records: ReqRecord[] = [];
  let counter = 0;
  let blockedCount = 0;
  let totalBytes = 0;

  // Centralized blocking logic helper. Returns a string reason if the request
  // should be blocked, otherwise null.
  function getBlockReason(
    reqUrl: string,
    rType: string,
    allowSetLocal: Set<string>,
    blockSetLocal: Set<string>,
  ): string | null {
    const rTypeLower = rType.toLowerCase();

    // If user explicitly allowed this resource type, do not block
    if (allowSetLocal.has(rTypeLower)) return null;

    const urlLower = reqUrl.toLowerCase();
    let parsedHost = "";
    let parsedPathLower = "";
    try {
      const p = new URL(reqUrl);
      parsedHost = p.hostname.toLowerCase();
      parsedPathLower = p.pathname.toLowerCase();
    } catch {
      parsedHost = "";
      parsedPathLower = "";
    }

    // Host-based blocking rules (centralized)
    if (
      parsedHost === "fast.appcues.com" ||
      parsedHost.endsWith(".fast.appcues.com")
    ) {
      return "blocked-appcues-fast";
    }
    if (parsedHost === "snap.licdn.com") {
      return "blocked-licdn-snap";
    }
    // Block zeroheight API calls
    if (
      parsedHost === "api.zeroheight.com" ||
      parsedHost.endsWith(".api.zeroheight.com")
    ) {
      return "blocked-zeroheight-api";
    }

    // 1) Block by resourceType for obvious cases (don't block scripts by default)
    if (rTypeLower === "stylesheet" || rTypeLower === "font") {
      return "blocked-resource-type";
    }

    // 2) Strict extension-based blocking (pathname only)
    let pathnameLower = "";
    try {
      pathnameLower = new URL(reqUrl).pathname.toLowerCase();
    } catch {
      pathnameLower = reqUrl.toLowerCase();
    }

    const imageExtRe = /\.(svg|gif|ico)(?:[?#]|$)/i;
    const fontExtRe = /\.(woff2?|ttf|otf|eot)(?:[?#]|$)/i;
    if (imageExtRe.test(pathnameLower) || fontExtRe.test(pathnameLower)) {
      return "blocked-ext";
    }

    // 3) Data: URI mime-based blocking (safe parse)
    if (urlLower.startsWith("data:")) {
      const m = urlLower.match(/^data:([^;,]+)[;,]/);
      const mime = m ? m[1] : "";
      if (
        mime.startsWith("image/svg") ||
        mime === "image/gif" ||
        mime === "image/x-icon" ||
        mime === "image/vnd.microsoft.icon" ||
        mime.startsWith("font/") ||
        mime.includes("woff") ||
        mime.includes("truetype") ||
        mime.includes("opentype")
      ) {
        return "blocked-data-uri";
      }
    }

    // 4) Honor any custom blocks passed via --block (these are resource types)
    if (blockSetLocal.has(rTypeLower)) return "blocked-by-inspector";

    // 5) Block sentry.io and subdomains
    if (parsedHost === "sentry.io" || parsedHost.endsWith(".sentry.io")) {
      return "blocked-sentry";
    }

    return null;
  }

  page.on("request", (req: HTTPRequest) => {
    const id = ++counter;
    const reqUrl = req.url();

    // Build record early
    const rec: ReqRecord = {
      id,
      url: reqUrl,
      method: req.method(),
      resourceType: req.resourceType(),
      timestamp: Date.now(),
    };
    records.push(rec);

    const rType = req.resourceType();
    const reason = getBlockReason(reqUrl, rType, allowSet, blockSet);
    if (reason) {
      blockedCount += 1;
      rec.failure = reason;
      req.abort().catch(() => {});
      return;
    }

    req.continue().catch(() => {});
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
        const n = parseInt(len as string, 10);
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
    const HarModuleUnknown = (await import("puppeteer-har")) as unknown;
    type PuppeteerHar = {
      start?: (opts?: { path?: string }) => Promise<void>;
      stop?: () => Promise<void>;
    };
    type PuppeteerHarCtor = new (p: Page) => PuppeteerHar;
    if (typeof HarModuleUnknown === "function") {
      harRecorder = new (HarModuleUnknown as unknown as PuppeteerHarCtor)(page);
    } else if (
      HarModuleUnknown &&
      typeof (HarModuleUnknown as Record<string, unknown>).PuppeteerHar ===
        "function"
    ) {
      const ctor = (HarModuleUnknown as Record<string, unknown>)
        .PuppeteerHar as unknown as PuppeteerHarCtor;
      harRecorder = new ctor(page);
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
      const password = cfg.ZEROHEIGHT_PROJECT_PASSWORD as string | undefined;
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
