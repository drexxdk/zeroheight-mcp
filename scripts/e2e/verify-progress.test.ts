import { scrape } from "@/tools/scraper/scrape";
import { isRecord } from "@/utils/common/typeGuards";
import logger from "../../src/utils/logger";
import { getProgressSnapshot } from "@/utils/common/progress";

// load env and config dynamically inside `run` so path aliases resolve

async function run(): Promise<void> {
  await import("dotenv/config");
  const cfg = await import("@/utils/config");
  const raw = cfg.config.scraper.scrapeTestPageUrls;
  if (!raw) {
    logger.log(
      "SKIP: SCRAPE_TEST_PAGE_URLS not set - provide comma-separated URLs to run",
    );
    process.exit(0);
  }

  const pageUrls = raw
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
  if (pageUrls.length === 0) {
    logger.log("SKIP: no valid URLs provided");
    process.exit(0);
  }

  logger.log(`Running scrape on ${pageUrls.length} pages...`);

  const res = await scrape({
    rootUrl: pageUrls[0],
    pageUrls,
    logger: (s) => logger.log(s),
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
      logger.error("FAIL: response missing progress field");
      logger.error(res);
      process.exit(2);
    }

    logger.log("Progress from tool:", progress);

    if (
      isRecord(progress) &&
      typeof progress["current"] === "number" &&
      typeof progress["total"] === "number"
    ) {
      try {
        const snap = getProgressSnapshot();
        if (snap.current === snap.total) {
          logger.log("PASS: snapshot.current === snapshot.total");
          process.exit(0);
        }
        logger.error(
          `FAIL: snapshot mismatch final current=${snap.current} total=${snap.total}`,
        );
        process.exit(1);
      } catch (e) {
        logger.error("FAIL: could not read progress snapshot", e);
        process.exit(3);
      }
    }
    logger.error("FAIL: progress object malformed", progress);
    process.exit(2);
  } catch (e) {
    logger.error("FAIL: could not parse tool response", e);
    process.exit(3);
  }
}

run().catch((e) => {
  logger.error(e);
  process.exit(4);
});
