/* eslint-disable no-console */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
async function main(): Promise<void> {
  // Load application config (reads env via dotenv like `scripts/cli.ts`)
  const { config } = await import("../../src/utils/config");
  const { fetchAndExtract } =
    await import("../../src/tools/scraper/utils/fetchExtractor");
  try {
    const projectUrl = config.env.zeroheightProjectUrl;
    const url = new URL("/10548dffa/p/0833d8-logo", projectUrl).href;
    const allowedHostname = new URL(projectUrl).hostname;
    const res = await fetchAndExtract({ url, allowedHostname });
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

void main();
