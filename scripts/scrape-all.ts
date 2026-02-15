import { config } from "dotenv";

// Ensure dotenv runs before importing any app modules that read env at module-evaluation time.
config({ path: ".env.local" });

async function main() {
  const { scrapeZeroheightProject } =
    await import("../src/tools/scraper/scrapeZeroheightProject");

  await scrapeZeroheightProject(
    "https://designsystem.lruddannelse.dk",
    "Design4allQ4",
  );
}

main().catch(console.error);
