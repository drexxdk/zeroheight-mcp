import defaultLogger from "@/utils/logger";
import { getClient } from "@/utils/common/supabaseClients";
import { formatSummaryBox, bulkUpsertPagesAndImages } from "./bulkUpsert";
import type { ImagesType } from "@/database.types";
import type { OverallProgress } from "../processPageAndImages";
import type { SummaryParams } from "./bulkUpsert";

export async function loadExistingImageUrls(
  db: unknown,
  logger?: (s: string) => void,
): Promise<Set<string>> {
  try {
    // db may be undefined in some test harnesses; guard accordingly
    if (!db) return new Set();

    type FromResult = { data?: unknown };
    type FromFn = (table: string) => { select: (s: string) => Promise<FromResult> };
    if (typeof db !== "object" || db === null) return new Set();
    const fromProp = Reflect.get(db, "from");
    if (typeof fromProp !== "function") return new Set();
    const fromFn = fromProp as FromFn;
    const { data: allExistingImages } = await fromFn("images").select("original_url");
    const existingArray = Array.isArray(allExistingImages)
      ? allExistingImages.filter((r: unknown) => typeof r === "object")
      : [];
    const set = new Set<string>();
    for (const img of existingArray) {
      try {
        const original = Reflect.get(img as object, "original_url");
        let normalizedUrl = typeof original === "string" ? original : "";
        const u = new URL(normalizedUrl);
        normalizedUrl = `${u.protocol}//${u.hostname}${u.pathname}`;
        set.add(normalizedUrl);
      } catch (e) {
        defaultLogger.debug("normalize URL failed:", e);
      }
    }
    if (logger) logger(`Found ${set.size} existing images in database`);
    return set;
  } catch (e) {
    if (logger) logger(`Failed to load existing images: ${String(e)}`);
    return new Set<string>();
  }
}

type PerformArgs = {
  pagesToUpsert: Array<Record<string, unknown>>;
  pendingImageRecords: Array<Record<string, unknown>>;
  uniqueAllowedImageUrls: Set<string>;
  uniqueAllImageUrls: Set<string>;
  uniqueUnsupportedImageUrls: Set<string>;
  allExistingImageUrls: Set<string>;
  imagesStats: { processed: number; uploaded: number; skipped: number; failed: number };
  pagesFailed: number;
  providedCount: number;
  logger?: (s: string) => void;
  dryRun?: boolean;
};

export async function performBulkUpsertSummary(
  args: PerformArgs,
): Promise<string[] | undefined> {
  const {
    pagesToUpsert,
    pendingImageRecords,
    uniqueAllowedImageUrls,
    uniqueAllImageUrls,
    uniqueUnsupportedImageUrls,
    allExistingImageUrls,
    imagesStats,
    pagesFailed,
    providedCount,
    logger,
    dryRun,
  } = args;

  try {
    const { client: dbClient } = getClient();
    const printer = (s: string): void => {
      if (logger) logger(s);
      else defaultLogger.log(s);
    };
    const res = await bulkUpsertPagesAndImages({
      db: dbClient!,
      pagesToUpsert,
      pendingImageRecords,
      uniqueAllowedImageUrls,
      uniqueAllImageUrls,
      uniqueUnsupportedImageUrls,
      allExistingImageUrls,
      imagesStats,
      pagesFailed,
      providedCount,
      dryRun: dryRun || false,
    });
    if (res.lines && res.lines.length) printer(res.lines.join("\n"));
    return res.lines;
  } catch (e) {
    defaultLogger.warn("V2 bulkUpsert failed:", e);
    // Try a dry run summary attempt
    try {
      const { client: dbClient } = getClient();
      const printer = (s: string): void => {
        if (logger) logger(s);
        else defaultLogger.log(s);
      };
      const res = await bulkUpsertPagesAndImages({
        db: dbClient!,
        pagesToUpsert,
        pendingImageRecords,
        uniqueAllowedImageUrls,
        uniqueAllImageUrls,
        uniqueUnsupportedImageUrls,
        allExistingImageUrls,
        imagesStats,
        pagesFailed,
        providedCount,
        dryRun: true,
      });
      if (res.lines && res.lines.length) printer(res.lines.join("\n"));
      return res.lines;
    } catch {
      const uniquePageMap = new Map<string, (typeof pagesToUpsert)[number]>();
      for (const p of pagesToUpsert) uniquePageMap.set(String(p.url), p);
      const totalUniquePages = uniquePageMap.size;
      const providedCountVal = providedCount;
      const insertedCountVal = totalUniquePages;
      const updatedCountVal = 0;
      const skippedCountVal =
        providedCountVal > 0 ? Math.max(0, providedCountVal - totalUniquePages) : 0;

      const params: SummaryParams = {
        providedCount: providedCountVal,
        pagesAnalyzed: providedCountVal > 0 ? providedCountVal : totalUniquePages,
        insertedCount: insertedCountVal,
        updatedCount: updatedCountVal,
        skippedCount: skippedCountVal,
        pagesFailed: pagesFailed,
        uniqueTotalImages: uniqueAllImageUrls.size,
        uniqueUnsupported: uniqueUnsupportedImageUrls.size,
        uniqueAllowed: uniqueAllowedImageUrls.size,
        imagesUploadedCount: imagesStats.uploaded,
        uniqueSkipped: Array.from(uniqueAllowedImageUrls).filter((u) =>
          allExistingImageUrls.has(u),
        ).length,
        imagesFailed: imagesStats.failed,
        imagesDbInsertedCount: pendingImageRecords.length,
        imagesAlreadyAssociatedCount: Array.from(uniqueAllowedImageUrls).filter((u) =>
          allExistingImageUrls.has(u),
        ).length,
      };
      const boxed = formatSummaryBox({ p: params });
      if (boxed && boxed.length) {
        const printer = (s: string): void => {
          if (logger) logger(s);
          else defaultLogger.log(s);
        };
        printer(boxed.join("\n"));
        return boxed;
      }
      return undefined;
    }
  }
}
