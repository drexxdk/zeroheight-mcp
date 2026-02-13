import { config } from "dotenv";
import { scrapeZeroheightProject } from "../lib/tools/scraper/scrapeZeroheightProject";

// Load environment variables
config({ path: ".env.local" });

async function scrapeSpecificPages() {
  console.log("Scraping specific Zeroheight pages...");

  const result = await scrapeZeroheightProject(
    "https://designsystem.lruddannelse.dk",
    "Design4allQ4",
    undefined, // no limit
    [
      "https://designsystem.lruddannelse.dk/10548dffa/p/51380f-graph-patterns-wip",
    ],
  );

  console.log("Scraping completed!");
  console.log("Result:", result);
}

scrapeSpecificPages().catch(console.error);
