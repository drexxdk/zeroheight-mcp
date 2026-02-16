import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { scrapeZeroheightProjectTestTool } =
    await import("../src/tools/scraper/testScrape");

  console.log("Calling test scraper tool (1 minute)...");
  const res = await scrapeZeroheightProjectTestTool.handler({
    durationMinutes: 1,
  });
  console.log("Tool response:", JSON.stringify(res, null, 2));
}

main().catch((e) => {
  console.error("Error running test scrape:", e);
  process.exit(1);
});
