import { config } from "dotenv";
import { scrapeZeroheightProject } from "@/tools/scraper/scrapeZeroheightProject";

// Load environment variables
config({ path: ".env.local" });

async function scrapeAllV2() {
  const projectUrl =
    process.env.ZEROHEIGHT_PROJECT_URL ||
    "https://designsystem.lruddannelse.dk";
  const password = process.env.ZEROHEIGHT_PROJECT_PASSWORD || "Design4allQ4";

  console.log("Starting scrape-all-v2...", projectUrl);

  const res = await scrapeZeroheightProject(
    projectUrl,
    password,
    undefined,
    (s) => console.log(s),
  );
  console.log("Scrape-v2 result:", JSON.stringify(res).slice(0, 200));

  console.log("Scrape-v2 completed!");
}

scrapeAllV2().catch(console.error);
