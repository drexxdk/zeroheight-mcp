import { config } from "dotenv";

// Ensure dotenv runs before importing any app modules that read env at module-evaluation time.
config({ path: ".env.local" });

async function testScrapeSpecificPages() {
  const { scrapeZeroheightProject } =
    await import("../src/tools/scraper/scrapeZeroheightProject");

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
