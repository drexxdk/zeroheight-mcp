import "dotenv/config";
import { config } from "@/utils/config";
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
  getDbExistingImageUrls,
  computeImagesAlreadyAssociatedCount,
} from "./bulkUpsertHelpers";
import { PagesType, ImagesType } from "@/generated/database-types";

// Allow either the real Supabase client or a lightweight test stub that
// provides a `from` method. Tests supply a `MockSupabaseClient` with a
// compatible `from` signature, so accept a looser shape here to avoid
// expensive casting in tests.
type DbClient = ReturnType<typeof getClient>["client"] | TestDbClient;
export type BulkUpsertResult = { lines: string[] };

export async function bulkUpsertPagesAndImages(options: {
  db: DbClient;
  pagesToUpsert: Array<Pick<PagesType, "url" | "title" | "content">>;
  pendingImageRecords: Array<{
    pageUrl: string;
    original_url: ImagesType["original_url"];
    storage_path: ImagesType["storage_path"];
  }>;
  uniqueAllImageUrls: Set<string>;
  uniqueAllowedImageUrls: Set<string>;
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
  runDurationMs?: number;
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
  } = imageInsertRes as {
    insertedCountTotal: number;
    insertedOriginalUrls: Set<string>;
    dbExistingImageUrls: Set<string>;
    imagesAlreadyAssociatedCount: number;
  };

  // Normalize inserted original URLs to canonical form used for DB comparisons
  const normalizedInsertedOriginals = new Set<string>();
  for (const val of insertedOriginalUrls) {
    try {
      const u = new URL(String(val));
      normalizedInsertedOriginals.add(
        `${u.protocol}//${u.hostname}${u.pathname}`,
      );
    } catch {
      normalizedInsertedOriginals.add(String(val));
    }
  }

  // Re-query the DB for existing allowed image URLs after the insert
  // to get the authoritative post-run set.
  const dbExistingAfterInsert = await getDbExistingImageUrls(
    db,
    uniqueAllowedImageUrls,
    allExistingImageUrls,
  );

  // Compute unique images skipped based on the pre-run snapshot (`allExistingImageUrls`).
  // If the post-insert DB state indicates that the only existing rows are the
  // ones we just inserted (i.e. postCount === normalizedInsertedOriginals.size),
  // prefer 0 skipped since the DB was effectively empty before the run.
  const preRunIntersection = Array.from(uniqueAllowedImageUrls).filter((u) =>
    allExistingImageUrls.has(u),
  ).length;
  const postRunIntersection = Array.from(uniqueAllowedImageUrls).filter((u) =>
    dbExistingAfterInsert.has(u),
  ).length;

  let uniqueSkippedOverride = preRunIntersection;
  if (
    postRunIntersection === normalizedInsertedOriginals.size &&
    postRunIntersection > 0
  ) {
    // The DB after insert only contains what we just added -> pre-run was empty
    uniqueSkippedOverride = 0;
  }

  // Compute associations before (we already had this value from imageInsertRes)
  const existingAssocBefore = imagesAlreadyAssociatedCount;
  // Compute associations after insertion and take the delta as new associations
  const pageIdSet = new Set<number>(Array.from(urlToId.values()));
  const existingAssocAfter = await computeImagesAlreadyAssociatedCount(
    db,
    Array.from(uniqueAllowedImageUrls),
    pageIdSet,
  );
  const newAssociations = Math.max(0, existingAssocAfter - existingAssocBefore);
  // Prefer the delta of associations computed from DB queries, but when that
  // is zero (mocked DBs or simple test stubs), fall back to the count of
  // inserted rows reported by the insert flow so summaries reflect inserts.
  const imagesDbInsertedCount = Math.max(
    newAssociations,
    insertedCountTotal || 0,
  );

  const params = buildSummaryParams({
    providedCount,
    uniquePages,
    existingUrlSet,
    pagesFailed,
    uniqueAllImageUrls,
    uniqueUnsupportedImageUrls,
    uniqueAllowedImageUrls,
    // Use the runtime-reported uploaded count from the progress snapshot.
    imagesStats: { ...imagesStats },
    insertedCountTotal: imagesDbInsertedCount,
    insertedOriginalUrls,
    // Report the pre-run associated count so the summary shows how many
    // associations already existed before this run started.
    imagesAlreadyAssociatedCount: existingAssocBefore,
    dbExistingImageUrls,
    uniqueSkippedOverride,
    runDurationMs: options.runDurationMs,
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
  if (p.skippedCount > 0 && p.providedCount > 0)
    lines.push(`Pages skipped:  ${p.skippedCount} (provided links)`);
  else lines.push(`Pages skipped:  ${p.skippedCount}`);
  lines.push(`Pages failed:   ${p.pagesFailed}`);
  // If we have an empty DB (no updates) and no page errors, show the
  // expected relationship between analyzed/inserted/redirected pages so
  // it's easy to verify where discrepancies come from.
  if (p.providedCount > 0 && p.pagesFailed === 0 && p.updatedCount === 0) {
    const expected = p.insertedCount + (p.pagesRedirected || 0);
    lines.push(`Pages analyzed expected (inserted + redirected): ${expected}`);
  }
  lines.push(`Pages redirected: ${p.pagesRedirected}`);
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
  if (typeof p.runtimeMs === "number") {
    const totalSeconds = Math.round(p.runtimeMs / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    lines.push(`Run time: ${timeStr}`);
    lines.push("");
  }
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
