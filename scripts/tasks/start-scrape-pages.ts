#!/usr/bin/env tsx

import { runTool } from "./start-task";
import { config } from "../../src/utils/config";

async function main(): Promise<void> {
  const urls = [
    "https://designsystem.lruddannelse.dk/10548dffa/p/51380f-graph-patterns-wip",
    "https://designsystem.lruddannelse.dk/10548dffa/p/3441e1-lindhardt-og-ringhof-uddannelse-design-system",
  ];

  const password = config.env.zeroheightProjectPassword || undefined;
  await runTool("../../src/tools/scraper/scrape", "scrapeTool", {
    pageUrls: urls,
    password,
  });
}

main().catch(console.error);
