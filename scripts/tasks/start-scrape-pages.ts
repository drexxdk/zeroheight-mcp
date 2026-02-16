import { runTool } from "./start-task";

async function main() {
  const urls = [
    "https://designsystem.lruddannelse.dk/10548dffa/p/51380f-graph-patterns-wip",
    "https://designsystem.lruddannelse.dk/10548dffa/p/3441e1-lindhardt-og-ringhof-uddannelse-design-system",
  ];

  await runTool("../src/tools/scraper/scrape", "scrapeTool", {
    pageUrls: urls,
  });
}

main().catch(console.error);
