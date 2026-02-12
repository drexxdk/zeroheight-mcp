import { config } from "dotenv";
import { scrapeZeroheightProjectTool } from "../lib/tools/scraper/scrapeZeroheightProject.js";

// Load environment variables from .env.local
config({ path: "./.env.local" });

async function main() {
  const limit = process.argv[2] ? parseInt(process.argv[2]) : undefined;
  await scrapeZeroheightProjectTool.handler({ limit });
}

main().catch(console.error);
