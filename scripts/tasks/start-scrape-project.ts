import { runTool } from "./start-task";

async function main() {
  // Start the scraper as a background task via the registered tool
  await runTool(
    "../src/tools/scraper/scrapeZeroheightProject",
    "scrapeZeroheightProjectTool",
    undefined,
  );
}

main().catch(console.error);
