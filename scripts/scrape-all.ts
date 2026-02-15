import { config } from "dotenv";

// Load environment variables before importing app code that reads them
config({ path: ".env.local" });

const { scrapeZeroheightProject } =
  await import("../src/tools/scraper/scrapeZeroheightProject");

async function scrapeAll() {
  console.log("Scraping all Zeroheight pages...");

  await scrapeZeroheightProject(
    "https://designsystem.lruddannelse.dk",
    "Design4allQ4",
  );

  console.log("Scraping completed!");
}

scrapeAll().catch(console.error);
