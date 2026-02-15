import { config } from "dotenv";
import { scrapeZeroheightProject } from "../src/tools/scraper/scrapeZeroheightProject";

// Load environment variables
config({ path: ".env.local" });

async function scrapeAll() {
  console.log("Scraping all Zeroheight pages...");

  await scrapeZeroheightProject(
    "https://designsystem.lruddannelse.dk",
    "Design4allQ4",
  );

  console.log("Scraping completed!");
}

scrapeAll().catch(console.error);
