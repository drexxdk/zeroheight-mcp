import { config } from "dotenv";
import { scrapeZeroheightProject } from "../lib/tools/scraper/scrapeZeroheightProject";

// Load environment variables
config({ path: ".env.local" });

async function testScrapeAll() {
  console.log("Scraping all Zeroheight pages...");

  await scrapeZeroheightProject(
    "https://designsystem.lruddannelse.dk",
    "Design4allQ4",
  );

  console.log("Scraping completed!");
}

testScrapeAll().catch(console.error);
