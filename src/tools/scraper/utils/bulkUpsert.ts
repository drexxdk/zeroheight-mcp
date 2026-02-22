import "dotenv/config";
import { config } from "@/utils/config";
import type { PagesType, ImagesType } from "@/database.types";
import type { TestDbClient } from "./mockDb";
import { getClient } from "@/utils/common/supabaseClients";
import boxen from "boxen";
// type guards previously used here are now in helpers
import {
  queryExistingPages,
  upsertPages,
  prepareImagesToInsert,
  dedupeImagesByKey,
  buildSummaryParams,
  SummaryParams,
  performImageInsertFlow,
} from "./bulkUpsertHelpers";

// Allow either the real Supabase client or a lightweight test stub that
// provides a `from` method. Tests supply a `MockSupabaseClient` with a
// compatible `from` signature, so accept a looser shape here to avoid
// expensive casting in tests.
type DbClient = ReturnType<typeof getClient>["client"] | TestDbClient;

// Helper types and inspection helpers were moved to `bulkUpsertHelpers`

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
  const uniquePages = Array.from(pageMap.values()).map((p) => ({
    url: p.url,
    title: (p as { title?: string | null }).title ?? undefined,
    content: (p as { content?: string | null }).content ?? undefined,
  }));

  // Query existing pages (best-effort)
  const uniqueUrls = uniquePages.map((p) => p.url);
  const existingUrlSet = await queryExistingPages(db, uniqueUrls);

  // Upsert pages in chunks with retries
  const pageChunkSize = config.scraper.pageUpsertChunk;
  const upsertedPagesAll = await upsertPages(
    db,
    uniquePages,
    pageChunkSize,
    options.dryRun,
    {
      maxAttempts: config.scraper.retry.maxAttempts,
      backoffMs: config.scraper.db.bulkUpsertBackoffMs,
    },
  );

  // Map url -> id for image inserts
  const urlToId = new Map<string, number>();
  upsertedPagesAll.forEach((p) => {
    if (p && p.url && p.id) urlToId.set(p.url, p.id);
  });

  // Prepare image records using resolved page IDs (moved to helper)
  const imagesToInsert = prepareImagesToInsert(pendingImageRecords, urlToId);

  const imageChunkSize = config.scraper.imageInsertChunk;
  const dedupImagesToInsert = dedupeImagesByKey(imagesToInsert);

  const imageInsertRes = await performImageInsertFlow({
    db,
    pendingImageRecords,
    imagesToInsert,
    dedupImagesToInsert,
    uniqueAllowedImageUrls,
    allExistingImageUrls,
    imageChunkSize,
    urlToId,
    dryRun: options.dryRun,
    retryCfg: {
      maxAttempts: config.scraper.retry.maxAttempts,
      retryBaseMs: config.scraper.retry.retryBaseMs,
    },
  });

  const {
    insertedCountTotal,
    insertedOriginalUrls,
    dbExistingImageUrls,
    imagesAlreadyAssociatedCount,
  } = imageInsertRes;

  const params = buildSummaryParams({
    providedCount,
    uniquePages,
    existingUrlSet,
    pagesFailed,
    uniqueAllImageUrls,
    uniqueUnsupportedImageUrls,
    uniqueAllowedImageUrls,
    imagesStats,
    insertedCountTotal,
    insertedOriginalUrls,
    imagesAlreadyAssociatedCount,
    dbExistingImageUrls,
  });
  const out = formatSummaryBox({ p: params });
  return { lines: out };
}

export default bulkUpsertPagesAndImages;

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
  lines.push(`Images processed: ${p.imagesProcessed}`);
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
