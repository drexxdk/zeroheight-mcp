#!/usr/bin/env tsx
import fs from "fs";
import path from "path";
import puppeteer, { Page } from "puppeteer";
import { tryLogin } from "../src/utils/common/scraperHelpers";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function fetchPages(options: {
  rootUrl: string;
  password?: string;
  outFile: string;
}): Promise<void> {
  const { rootUrl, password, outFile } = options;
  const browser = await puppeteer.launch({
    headless: true,
    // userDataDir: path.join(process.cwd(), "tmp", "fetch-profile"),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page: Page = await browser.newPage();

    // Prepare diagnostics directory and a network listener to capture the
    // site's automatic API request. We log all responses to `network-log.jsonl`
    // and write headers + body when we see the load_pages endpoint.
    const diagDir = path.join(process.cwd(), "src", "generated");
    fs.mkdirSync(diagDir, { recursive: true });

    let captured = false;
    let resolveCaptured: (v?: unknown) => void = () => {};
    const capturedPromise = new Promise<unknown>((resolve) => {
      resolveCaptured = resolve;
    });

    page.on("response", async (res) => {
      try {
        const url = res.url();
        const status = res.status();
        if (
          url.includes("/api/styleguide/load_pages") &&
          status === 200 &&
          !captured
        ) {
          const text = await res.text();
          // write the JSON body and headers for later inspection
          try {
            fs.writeFileSync(path.join(diagDir, "pages.json"), text, "utf8");
          } catch (_e) {
            // ignore write errors
          }
          captured = true;
          resolveCaptured(true);
        }
      } catch (_e) {
        // swallow
      }
    });

    await page.goto(rootUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Attempt login if password provided.
    if (password) await tryLogin({ page, password }).catch(() => {});

    // Small wait to allow post-login redirects / session establishment.
    await page
      .waitForNavigation({ waitUntil: "networkidle2", timeout: 1000 })
      .catch(() => {});

    // Diagnostics: save cookies, HTML snapshot, and a screenshot so we can
    // inspect whether login succeeded and what the page looks like.

    // Wait for the page's own request to the pages API so we inherit the
    // browser's authenticated session and any JS-applied headers. We prefer
    // the network listener capture; fall back to older strategies when not
    // observed within the timeout.
    let result: unknown;
    try {
      // Wait for our response-capture listener to observe the load_pages
      // request (resolved by the listener). If it doesn't arrive within the
      // timeout, the Promise.race will throw and we proceed to fallbacks.
      await Promise.race([
        capturedPromise,
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error("no auto request")), 20000),
        ),
      ]);

      // If the listener wrote `src/generated/pages.json`, read it back.
      const pagesPath = path.join(
        process.cwd(),
        "src",
        "generated",
        "pages.json",
      );
      if (fs.existsSync(pagesPath)) {
        const txt = fs.readFileSync(pagesPath, "utf8");
        result = JSON.parse(txt);
      } else {
        throw new Error("captured response but pages.json missing");
      }
    } catch (_waitErr) {
      throw new Error(
        "Automatic /api/styleguide/load_pages request was not observed within timeout",
      );
    }

    // Ensure directory exists and write the output JSON.
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");
    // eslint-disable-next-line no-console
    console.log("Wrote pages JSON to", outFile);
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const { config } = await import("@/utils/config");
  const rootUrl = config.env.zeroheightProjectUrl;
  const password = config.env.zeroheightProjectPassword;
  const outFile = path.join(process.cwd(), "src", "generated", "pages.json");

  try {
    await fetchPages({ rootUrl, password, outFile });
    process.exit(0);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("Failed to fetch pages:", e);
    process.exit(2);
  }
}

void main();
