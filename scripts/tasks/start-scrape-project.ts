#!/usr/bin/env tsx

import { runTool } from "./start-task";
import { config } from "../../src/utils/config";
import logger from "../../src/utils/logger";

async function main(): Promise<void> {
  // Start the scraper as a background task via the registered tool
  const password = config.env.zeroheightProjectPassword || undefined;
  await runTool("../../src/tools/scraper/scrape", "scrapeTool", {
    password,
  });
}

main().catch((e) => {
  logger.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
