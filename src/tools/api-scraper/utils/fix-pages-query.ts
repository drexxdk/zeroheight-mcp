import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import logger from "@/utils/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const file = resolve(__dirname, "pages-query.json");

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function fixPagesQuery(): void {
  const raw = readFileSync(file, { encoding: "utf8" });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (_err) {
    logger.error("Failed to parse pages-query.json as JSON:", _err);
    process.exitCode = 1;
    return;
  }

  let arr: unknown[] | null = null;

  if (Array.isArray(parsed)) arr = parsed as unknown[];
  else if (
    isObject(parsed) &&
    isObject(parsed.content) &&
    Array.isArray(parsed.content)
  ) {
    const first = parsed.content[0];
    if (isObject(first) && typeof first.text === "string") {
      const text = first.text;
      try {
        arr = JSON.parse(text);
      } catch (_err) {
        const unescaped = text
          .replace(/\\"/g, '"')
          .replace(/\\n/g, "\n")
          .replace(/\\t/g, "\t");
        try {
          arr = JSON.parse(unescaped);
        } catch (_err2) {
          logger.error("Failed to parse embedded JSON string:", _err2);
          process.exitCode = 1;
          return;
        }
      }
    }
  }

  if (!arr) {
    logger.error("Could not find JSON array in pages-query.json");
    process.exitCode = 1;
    return;
  }

  writeFileSync(file, JSON.stringify(arr, null, 2), { encoding: "utf8" });

  const totalItems = arr.length;
  let imageCount = 0;
  for (const it of arr) {
    if (isObject(it) && isObject(it.images)) {
      imageCount += Object.keys(it.images).length;
    }
  }

  logger.log(`Wrote ${totalItems} items to ${file}`);
  logger.log(`Total image associations: ${imageCount}`);
}

export default fixPagesQuery;
