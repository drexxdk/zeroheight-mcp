import { runTool } from "./start-task";
import { ZEROHEIGHT_PROJECT_PASSWORD } from "../../src/utils/config";

async function main() {
  // Start the scraper as a background task via the registered tool
  const password = ZEROHEIGHT_PROJECT_PASSWORD || undefined;
  await runTool("../../src/tools/scraper/scrape", "scrapeTool", {
    password,
  });
}

main().catch(console.error);
