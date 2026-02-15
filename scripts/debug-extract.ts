import { config } from "dotenv";
config({ path: ".env.local" });

import puppeteer from "puppeteer";
import { extractPageData } from "../src/tools/scraper/pageExtraction";
import { tryLogin } from "../src/lib/common/scraperHelpers";
import { ZEROHEIGHT_PROJECT_PASSWORD } from "../src/lib/config";

const seeds = [
  "https://designsystem.lruddannelse.dk/10548dffa/p/51380f-graph-patterns-wip",
  "https://designsystem.lruddannelse.dk/10548dffa/p/3441e1-lindhardt-og-ringhof-uddannelse-design-system",
];

async function run() {
  const browser = await puppeteer.launch({ headless: true });
  for (const url of seeds) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1024 });
    console.log(`Visiting ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    if (ZEROHEIGHT_PROJECT_PASSWORD) {
      try {
        await tryLogin(page, ZEROHEIGHT_PROJECT_PASSWORD);
        console.log("Login attempt on page complete");
      } catch (e) {
        console.log("Login attempt failed:", String(e));
      }
    }
    const hostname = new URL(url).hostname;
    const extracted = await extractPageData(page, url, hostname).catch((e) => {
      console.error("extract failed", e);
      return null;
    });
    if (!extracted) continue;
    console.log(`Title: ${extracted.title}`);
    console.log(`All images: ${extracted.normalizedImages.length}`);
    console.log(`Supported images: ${extracted.supportedImages.length}`);
    console.log(
      "Sample normalized images:",
      extracted.normalizedImages.slice(0, 10).map((i) => i.src),
    );
    console.log(
      "Sample supported images:",
      extracted.supportedImages.slice(0, 10).map((i) => i.src),
    );
    await page.close();
  }
  await browser.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
