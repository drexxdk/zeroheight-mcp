import "dotenv/config";
import { config } from "@/utils/config";
import type { PagesType, ImagesType } from "@/database.types";
import type { TestDbClient } from "./mockDb";
import { getClient } from "@/utils/common/supabaseClients";
import boxen from "boxen";
import logger from "@/utils/logger";
import { isRecord, getProp } from "../../../utils/common/typeGuards";
import { queryExistingPages, insertImageChunks } from "./bulkUpsertHelpers";
import { toErrorObj } from "@/utils/common/errorUtils";

// Allow either the real Supabase client or a lightweight test stub that
// provides a `from` method. Tests supply a `MockSupabaseClient` with a
// compatible `from` signature, so accept a looser shape here to avoid
// expensive casting in tests.
type DbClient = ReturnType<typeof getClient>["client"] | TestDbClient;

type InspectionThenable = {
  limit: (n: number) => Promise<unknown>;
  order: (field: string, dir?: unknown) => InspectionThenable;
};
type InspectionSelect = {
  in: (key: string, values: unknown) => InspectionThenable;
  order: (field: string, dir?: unknown) => InspectionThenable;
};
type InspectionFrom = { select: (cols?: string) => InspectionSelect };
type InspectionClient = { from: (table: string) => InspectionFrom };

function getInspectionClient(db: DbClient): InspectionClient | null {
  const candidate = db as unknown as InspectionClient;
  if (candidate && typeof candidate.from === "function") return candidate;
  return null;
}
type UpsertPagesRes = {
  data?: Array<{ id?: number; url?: string }>;
  error?: { message?: string } | null;
};
// InsertRes type not needed

export type BulkUpsertResult = { lines: string[] };

export async function bulkUpsertPagesAndImages(options: {
  db: DbClient;
  pagesToUpsert: Array<Pick<PagesType, "url" | "title" | "content">>;
  pendingImageRecords: Array<{
    pageUrl: string;
    original_url: ImagesType["original_url"];
    storage_path: ImagesType["storage_path"];
  }>;
  uniqueAllowedImageUrls: Set<string>;
  uniqueAllImageUrls: Set<string>;
  uniqueUnsupportedImageUrls: Set<string>;
  allExistingImageUrls: Set<string>;
  imagesStats: {
    processed: number;
    uploaded: number;
    skipped: number;
    failed: number;
  };
  pagesFailed: number;
  providedCount: number;
  dryRun?: boolean;
}): Promise<BulkUpsertResult> {
  const {
    db,
    pagesToUpsert,
    pendingImageRecords,
    uniqueAllowedImageUrls,
    uniqueAllImageUrls,
    uniqueUnsupportedImageUrls,
    allExistingImageUrls,
    imagesStats,
    pagesFailed,
    providedCount,
  } = options;

  // Deduplicate pages by URL
  const pageMap = new Map<
    string,
    Pick<PagesType, "url" | "title" | "content">
  >();
  for (const p of pagesToUpsert) pageMap.set(p.url, p);
  const uniquePages = Array.from(pageMap.values());

  // Query existing pages (best-effort)
  const uniqueUrls = uniquePages.map((p) => p.url);
  const existingUrlSet = await queryExistingPages(db, uniqueUrls);

  // Upsert pages in chunks with retries
  const pageChunkSize = config.scraper.pageUpsertChunk;
  const upsertedPagesAll = await upsertPages(db, uniquePages, pageChunkSize, options.dryRun, {
    maxAttempts: config.scraper.retry.maxAttempts,
    backoffMs: config.scraper.db.bulkUpsertBackoffMs,
  });

  // Map url -> id for image inserts
  const urlToId = new Map<string, number>();
  upsertedPagesAll.forEach((p) => {
    if (p && p.url && p.id) urlToId.set(p.url, p.id);
  });

  // Prepare image records using resolved page IDs
  const imagesToInsert = pendingImageRecords
    .map((r) => {
      const page_id = urlToId.get(r.pageUrl);
      if (!page_id) return null;
      return {
        page_id,
        original_url: r.original_url,
        storage_path: r.storage_path,
      };
    })
    .filter(
      (
        v,
      ): v is {
        page_id: number;
        original_url: ImagesType["original_url"];
        storage_path: ImagesType["storage_path"];
      } => Boolean(v),
    );

  // Compute how many of the unique allowed images are already associated with the processed pages
  const imagesFoundArray = Array.from(uniqueAllowedImageUrls);
  const pageIdSet = new Set<number>(Array.from(urlToId.values()));
  const imagesAlreadyAssociatedCount = await computeImagesAlreadyAssociatedCount(db, imagesFoundArray, pageIdSet);

  // Insert new images in manageable chunks to avoid very large single inserts.
  // We retry transient failures a few times. Skip writes when doing a dry run.
  const imageChunkSize = config.scraper.imageInsertChunk;
  // Deduplicate image insert rows by original_url+storage_path to avoid
  // inserting the same image multiple times (can happen when the same
  // image appears on multiple pages).
  const seenImageKeys = new Set<string>();
  const dedupImagesToInsert: typeof imagesToInsert = [];
  for (const img of imagesToInsert) {
    const key = `${img.original_url}||${img.storage_path}`;
    if (!seenImageKeys.has(key)) {
      seenImageKeys.add(key);
      dedupImagesToInsert.push(img);
    }
  }

  const debug = config.scraper.debug;
  // Start with the preloaded set (from DB at startup). We'll optionally
  // replace it with a fresh DB check when debugging.
  let dbExistingImageUrls = allExistingImageUrls;

  // Always attempt an authoritative DB lookup for whether an original_url
  // already exists. This keeps behavior deterministic regardless of the
  // `SCRAPER_DEBUG` flag and avoids racey heuristics based on the initial
  // `allExistingImageUrls` snapshot.
  if (debug)
    logger.debug(
      `[debug] image insert: pendingRecords=${pendingImageRecords.length} imagesToInsert=${imagesToInsert.length} dedup=${dedupImagesToInsert.length} allExisting=${allExistingImageUrls.size}`,
    );
  else
    logger.log(
      `image insert: pendingRecords=${pendingImageRecords.length} imagesToInsert=${imagesToInsert.length} dedup=${dedupImagesToInsert.length} allExisting=${allExistingImageUrls.size}`,
    );

  // Attempt an authoritative DB lookup for whether an original_url already exists
  const dbExistingImageUrls = await getDbExistingImageUrls(db, uniqueAllowedImageUrls, allExistingImageUrls);

  const skippedList = Array.from(uniqueAllowedImageUrls).filter((u) =>
    dbExistingImageUrls.has(u),
  );
  if (debug) {
    logger.debug(
      `[debug] uniqueAllowed=${uniqueAllowedImageUrls.size} uniqueSkipped(before)=${skippedList.length} sampleSkipped=${skippedList
        .slice(0, config.scraper.log.sampleSize)
        .join(", ")}`,
    );
    logger.debug(
      `[debug] sample allExisting (first ${config.scraper.log.sampleSize}): ${Array.from(
        allExistingImageUrls,
      )
        .slice(0, config.scraper.log.sampleSize)
        .join(", ")}`,
    );
    logger.debug(
      `[debug] sample uniqueAllowed (first ${config.scraper.log.sampleSize}): ${Array.from(
        uniqueAllowedImageUrls,
      )
        .slice(0, config.scraper.log.sampleSize)
        .join(", ")}`,
    );
    const intersection = Array.from(uniqueAllowedImageUrls).filter((u) =>
      dbExistingImageUrls.has(u),
    );
    logger.debug(
      `[debug] intersection sample (first ${config.scraper.log.sampleSize}): ${intersection
        .slice(0, config.scraper.log.sampleSize)
        .join(", ")}`,
    );

    // If we have intersection URLs, fetch DB rows for inspection (up to 50)
    if (intersection.length > 0 && db) {
      try {
        const inspector = getInspectionClient(db);
        if (inspector) {
          const dbRes = await inspector
            .from("images")
            .select("id, original_url, created_at")
            .in("original_url", intersection)
            .order("created_at", { ascending: false })
            .limit(config.scraper.db.inspectLimit);
          const maybeDbData = dbRes;
          if (isRecord(maybeDbData)) {
            const maybeData = getProp(maybeDbData, "data");
            logger.debug(
              `[debug] DB inspection for intersection (up to ${config.scraper.db.inspectLimit} rows): ${JSON.stringify(
                Array.isArray(maybeData)
                  ? maybeData.slice(0, config.scraper.db.inspectSampleSize)
                  : [],
                null,
                2,
              )}`,
            );
          } else {
            logger.debug(
              `[debug] DB inspection for intersection (up to ${config.scraper.db.inspectLimit} rows): []`,
            );
          }
        } else {
          // Fallback: try the real client chain and ignore errors
          try {
            const realDb = db as ReturnType<typeof getClient>["client"];
            const realRes = await realDb!
              .from("images")
              .select("id, original_url, created_at")
              .in("original_url", intersection)
              .order("created_at", { ascending: false })
              .limit(config.scraper.db.inspectLimit);
            const maybeDbData = realRes;
            if (isRecord(maybeDbData)) {
              const maybeData = getProp(maybeDbData, "data");
              logger.debug(
                `[debug] DB inspection for intersection (up to ${config.scraper.db.inspectLimit} rows): ${JSON.stringify(
                  Array.isArray(maybeData)
                    ? maybeData.slice(0, config.scraper.db.inspectSampleSize)
                    : [],
                  null,
                  2,
                )}`,
              );
            } else {
              logger.debug(
                `[debug] DB inspection for intersection (up to ${config.scraper.db.inspectLimit} rows): []`,
              );
            }
          } catch (err) {
            logger.debug(`[debug] DB inspection error: ${String(err)}`);
          }
        }
      } catch (err) {
        logger.debug(`[debug] DB inspection error: ${String(err)}`);
      }
    }
    logger.debug(
      `[debug] pendingImageRecords (first ${config.scraper.log.sampleSize}): ${pendingImageRecords
        .slice(0, config.scraper.log.sampleSize)
        .map((p) => p.original_url)
        .join(", ")}`,
    );
    logger.debug(
      `[debug] imagesToInsert (first ${config.scraper.log.sampleSize}): ${imagesToInsert
        .slice(0, config.scraper.log.sampleSize)
        .map((i) => i.original_url + " -> " + i.storage_path)
        .join(", ")}`,
    );
  }
  let insertedCountTotal = 0;
  let insertedOriginalUrls = new Set<string>();
  if (!options.dryRun && dedupImagesToInsert.length > 0) {
    const res = await insertImageChunks(db, dedupImagesToInsert, imageChunkSize, {
      maxAttempts: config.scraper.retry.maxAttempts,
      retryBaseMs: config.scraper.retry.retryBaseMs,
    });
    insertedCountTotal = res.insertedCountTotal;
    insertedOriginalUrls = res.insertedOriginalUrls;
  } else {
    // Dry-run: assume none inserted, but for reporting we can set insertedCountTotal
    // to the number of unique dedup records (they would be inserted if not dry-run).
    insertedCountTotal = dedupImagesToInsert.length;
  }

  const totalUniquePages = uniquePages.length;
  const existingCount = existingUrlSet.size;
  const insertedCount = Math.max(0, totalUniquePages - existingCount);
  const updatedCount = existingCount;
  const skippedCount =
    providedCount > 0 ? Math.max(0, providedCount - totalUniquePages) : 0;
  const pagesAnalyzed =
    providedCount > 0 ? providedCount : totalUniquePages + pagesFailed;

  // Number of storage upload operations performed (instances)
  const imagesUploadedCount = imagesStats.uploaded;
  const imagesDbInsertedCount = insertedCountTotal;
  const uniqueTotalImages = uniqueAllImageUrls.size;
  const uniqueUnsupported = uniqueUnsupportedImageUrls.size;
  const uniqueAllowed = uniqueAllowedImageUrls.size;
  // Compute uniqueSkipped after inserts so we don't count items we just inserted.
  const uniqueSkipped = Array.from(uniqueAllowedImageUrls).filter(
    (u) => dbExistingImageUrls.has(u) && !insertedOriginalUrls.has(u),
  ).length;
  const params = {
    providedCount,
    pagesAnalyzed,
    insertedCount,
    updatedCount,
    skippedCount,
    pagesFailed,
    uniqueTotalImages,
    uniqueUnsupported,
    uniqueAllowed,
    imagesUploadedCount,
    uniqueSkipped,
    imagesFailed: imagesStats.failed,
    imagesDbInsertedCount,
    imagesAlreadyAssociatedCount,
  };

  const out = formatSummaryBox({ p: params });
  return { lines: out };
}

export default bulkUpsertPagesAndImages;

export type SummaryParams = Readonly<{
  providedCount: number;
  pagesAnalyzed: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  pagesFailed: number;
  uniqueTotalImages: number;
  uniqueUnsupported: number;
  uniqueAllowed: number;
  imagesUploadedCount: number;
  uniqueSkipped: number;
  imagesFailed: number;
  imagesDbInsertedCount: number;
  imagesAlreadyAssociatedCount: number;
}>;

export function formatSummaryBox({ p }: { p: SummaryParams }): string[] {
  const lines: string[] = [];
  lines.push("Scraping Completed");
  lines.push("");
  if (p.providedCount > 0) lines.push(`Pages provided: ${p.providedCount}`);
  lines.push(`Pages analyzed: ${p.pagesAnalyzed}`);
  lines.push(`Pages inserted: ${p.insertedCount}`);
  lines.push(`Pages updated:  ${p.updatedCount}`);
  lines.push(`Pages skipped:  ${p.skippedCount}`);
  lines.push(`Pages failed:   ${p.pagesFailed}`);
  lines.push("");
  lines.push("");
  lines.push(`Images found: ${p.uniqueTotalImages} (unique)`);
  lines.push(`Supported images: ${p.uniqueAllowed} (unique)`);
  lines.push(`Unsupported images: ${p.uniqueUnsupported} (unique)`);
  lines.push(`Images uploaded: ${p.imagesUploadedCount}`);
  lines.push(
    `Unique images skipped: ${p.uniqueSkipped} (already present before run)`,
  );
  lines.push(`Images failed: ${p.imagesFailed}`);
  lines.push("");
  lines.push("");
  lines.push(
    `New associations between pages and images: ${p.imagesDbInsertedCount}`,
  );
  lines.push(
    `Images already associated with pages: ${p.imagesAlreadyAssociatedCount}`,
  );

  const out = boxen(lines.join("\n"), {
    padding: { top: 0, right: 1, bottom: 0, left: 1 },
    borderStyle: "single",
  });
  return out.split(/\r?\n/);
}
