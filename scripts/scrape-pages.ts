import { config } from "dotenv";

// Load environment variables before importing app code that reads them
config({ path: ".env.local" });

const { scrapeZeroheightProject } =
  await import("../src/tools/scraper/scrapeZeroheightProject");

async function testScrapeSpecificPages() {
  await scrapeZeroheightProject(
    "https://designsystem.lruddannelse.dk",
    "Design4allQ4",
    [
      "https://designsystem.lruddannelse.dk/10548dffa/p/51380f-graph-patterns-wip",
      "https://designsystem.lruddannelse.dk/10548dffa/p/3441e1-lindhardt-og-ringhof-uddannelse-design-system",
    ],
  );
}

testScrapeSpecificPages().catch(console.error);
