import { scrape } from "@/tools/scraper/scrape";
import { isRecord } from "@/utils/common/typeGuards";
async function run(): Promise<void> {
  const { SCRAPE_TEST_PAGE_URLS } = await import("@/utils/config");
  const raw = SCRAPE_TEST_PAGE_URLS || "";
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

  const res = await scrape({
    rootUrl: pageUrls[0],
    password: undefined,
    pageUrls,
    logger: (s) => console.log(s),
  });

  try {
    const extractProgress = (v: unknown): unknown => {
      if (isRecord(v) && "progress" in v) {
        return v["progress"];
      }
      if (isRecord(v) && "content" in v) {
        const content = v["content"];
        if (Array.isArray(content) && content.length > 0) {
          const first = content[0];
          if (isRecord(first) && "text" in first) {
            const text = String(first["text"] ?? "");
            try {
              return JSON.parse(text).progress;
            } catch {
              return undefined;
            }
          }
        }
      }
      return undefined;
    };

    const progress = extractProgress(res);
    if (!progress) {
      console.error("FAIL: response missing progress field");
      console.error(res);
      process.exit(2);
    }

    console.log("Progress from v2:", progress);

    if (
      isRecord(progress) &&
      typeof progress["current"] === "number" &&
      typeof progress["total"] === "number"
    ) {
      if (progress["current"] === progress["total"]) {
        console.log("PASS: progress.current === progress.total");
        process.exit(0);
      }
      console.error(
        `FAIL: progress mismatch final current=${progress["current"]} total=${progress["total"]}`,
      );
      process.exit(1);
    }
    console.error("FAIL: progress object malformed", progress);
    process.exit(2);
  } catch (e) {
    console.error("FAIL: could not parse tool response", e);
    process.exit(3);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(4);
});
