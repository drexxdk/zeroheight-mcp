import fs from "fs";
import path from "path";
import logger from "@/utils/logger";

async function fetchRemote(): Promise<void> {
  const url =
    "https://raw.githubusercontent.com/drexxdk/zeroheight-mcp/feature/-api-scrape/src/tools/api-scraper/generated/pages-model.json";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const json = await res.json();
  // Compute directories relative to this script's repository path
  const scriptDir = path.dirname(
    new URL(import.meta.url).pathname.replace(/^\/[A-Z]:/i, ""),
  );
  const outDir = path.join(scriptDir, "..");
  const outPath = path.join(outDir, "page-urls.json");
  const genPath = path.join(outDir, "generated", "pages-model.json");
  const urls = Array.isArray(json)
    ? (json
        .map((x: unknown) =>
          typeof x === "object" && x !== null && "url" in x
            ? (x as { url?: unknown }).url
            : undefined,
        )
        .filter(Boolean) as string[])
    : [];
  fs.mkdirSync(path.join(outDir, "generated"), { recursive: true });
  fs.writeFileSync(genPath, JSON.stringify(json, null, 2), "utf8");
  fs.writeFileSync(outPath, JSON.stringify(urls, null, 2), "utf8");
  logger.log(`wrote ${urls.length} urls to ${outPath}`);
}

(async () => {
  try {
    await fetchRemote();
  } catch (e) {
    logger.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
})();
