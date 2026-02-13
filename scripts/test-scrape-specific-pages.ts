import { config } from "dotenv";
import { scrapeZeroheightProject } from "../lib/tools/scraper/scrapeZeroheightProject";

// Load environment variables
config({ path: ".env.local" });

async function testScrapeSpecificPages() {
  console.log("Scraping specific Zeroheight pages...");

  await scrapeZeroheightProject(
    "https://designsystem.lruddannelse.dk",
    "Design4allQ4",
    [
      "https://designsystem.lruddannelse.dk/10548dffa/p/51380f-graph-patterns-wip",
      "https://designsystem.lruddannelse.dk/10548dffa/p/3441e1-lindhardt-og-ringhof-uddannelse-design-system",
    ],
  );

  console.log("Scraping completed!");
}

testScrapeSpecificPages().catch(console.error);
