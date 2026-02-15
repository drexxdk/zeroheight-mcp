import { scrapeZeroheightProjectV2 } from "@/tools/scraper/scrapeZeroheightProjectV2";

async function run() {
  const raw = process.env.SCRAPE_TEST_PAGE_URLS || "";
  if (!raw) {
    console.log(
      "SKIP: SCRAPE_TEST_PAGE_URLS not set - provide comma-separated URLs to run",
    );
    process.exit(0);
  }

  const pageUrls = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (pageUrls.length === 0) {
    console.log("SKIP: no valid URLs provided");
    process.exit(0);
  }

  console.log(`Running scrape-v2 on ${pageUrls.length} pages...`);

  const res = await scrapeZeroheightProjectV2(
    pageUrls[0],
    undefined,
    pageUrls,
    (s) => console.log(s),
  );

  try {
    const text = res.content?.[0]?.text || "";
    const parsed = JSON.parse(text);
    const progress = parsed.progress;
    if (!progress) {
      console.error("FAIL: response missing progress field");
      console.error(parsed);
      process.exit(2);
    }

    console.log("Progress from v2:", progress);

    if (progress.current === progress.total) {
      console.log("PASS: progress.current === progress.total");
      process.exit(0);
    } else {
      console.error(
        `FAIL: progress mismatch final current=${progress.current} total=${progress.total}`,
      );
      process.exit(1);
    }
  } catch (e) {
    console.error("FAIL: could not parse tool response", e);
    process.exit(3);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(4);
});
