import 'dotenv/config';
import type { PagesType, ImagesType } from "@/lib/database.types";
import { getClient } from "@/lib/common/supabaseClients";
import boxen from "boxen";

type DbClient = ReturnType<typeof getClient>["client"];

type UpsertPagesRes = {
  data?: Array<{ id?: number; url?: string }>;
  error?: unknown;
};
// InsertRes type not needed

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
}): Promise<{ lines: string[] }> {
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
  let existingPagesBefore: Array<{ url?: string }> = [];
  try {
    // Always attempt to query existing pages to produce accurate dry-run
    // summaries. This is a read-only operation and safe even when callers
    // requested dryRun.
    const { data: existingData } = await db!
      .from("pages")
      .select("url")
      .in("url", uniqueUrls);
    existingPagesBefore = (existingData as Array<{ url?: string }>) || [];
  } catch (err) {
    console.warn("Could not query existing pages before upsert:", err);
  }
  const existingUrlSet = new Set(
    existingPagesBefore.map((p) => p?.url).filter(Boolean) as string[],
  );

  // Upsert pages in chunks with retries
  const pageChunkSize = Number(process.env.SCRAPER_PAGE_UPSERT_CHUNK || 200);
  const upsertedPagesAll: Array<{ id?: number; url?: string }> = [];
  for (let i = 0; i < uniquePages.length; i += pageChunkSize) {
    const chunk = uniquePages.slice(i, i + pageChunkSize);
    let attempts = 0;
    let chunkResult: UpsertPagesRes | null = null;
    while (attempts < 3) {
      try {
        if (!options.dryRun) {
          const res = await db!
            .from("pages")
            .upsert(chunk, { onConflict: "url" })
            .select("id, url");
          chunkResult = res as unknown as UpsertPagesRes;
          if (!chunkResult.error) break;
        } else {
          // Dry run: pretend upsert succeeded and generate ids
          chunkResult = {
            data: chunk.map((p, idx) => ({ id: i + idx + 1, url: p.url })),
          };
          break;
        }
      } catch (err) {
        chunkResult = { error: err };
      }
      attempts++;
      if (attempts < 3) await new Promise((r) => setTimeout(r, 500 * attempts));
    }
    if (chunkResult && chunkResult.data) {
      upsertedPagesAll.push(
        ...(chunkResult.data as Array<{ id?: number; url?: string }>),
      );
    } else if (chunkResult?.error) {
      console.error("Error bulk upserting pages chunk:", chunkResult.error);
    }
  }

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
    .filter(Boolean) as Array<{
    page_id: number;
    original_url: ImagesType["original_url"];
    storage_path: ImagesType["storage_path"];
  }>;

  // Compute how many of the unique allowed images are already associated with the processed pages
  let imagesAlreadyAssociatedCount = 0;
  try {
    const imagesFoundArray = Array.from(uniqueAllowedImageUrls);
    if (imagesFoundArray.length > 0) {
      const pageIdSet = new Set<number>(Array.from(urlToId.values()));
      for (const norm of imagesFoundArray) {
        try {
          const { data: qdata, error: qerr } = await db!
            .from("images")
            .select("original_url, page_id")
            .ilike("original_url", `${norm}%`);
          if (qerr || !qdata) continue;
          if (
            (qdata as Array<{ page_id?: number | null }>).some(
              (r) =>
                typeof r.page_id === "number" &&
                pageIdSet.has(r.page_id as number),
            )
          ) {
            imagesAlreadyAssociatedCount++;
          }
        } catch {
          // continue
        }
      }
    }
  } catch (e) {
    console.warn("DEBUG: failed to compute imagesAlreadyAssociatedCount:", e);
  }

  // Insert new images in manageable chunks to avoid very large single inserts.
  // We retry transient failures a few times. Skip writes when doing a dry run.
  const imageChunkSize = Number(process.env.SCRAPER_IMAGE_INSERT_CHUNK || 500);
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

  const debug = !!process.env.SCRAPER_DEBUG;
  // Start with the preloaded set (from DB at startup). We'll optionally
  // replace it with a fresh DB check when debugging.
  let dbExistingImageUrls = allExistingImageUrls;

  if (debug) {
    console.log(`[scraper] image insert: pendingRecords=${pendingImageRecords.length} imagesToInsert=${imagesToInsert.length} dedup=${dedupImagesToInsert.length} allExisting=${allExistingImageUrls.size}`);

    // Prefer authoritative DB lookup for whether an original_url already exists.
    if (db && uniqueAllowedImageUrls.size > 0) {
      try {
        const existingRes = await db
          .from("images")
          .select("original_url")
          .in("original_url", Array.from(uniqueAllowedImageUrls))
          .limit(1000);
        const existingData = (existingRes as unknown) as { data?: Array<{ original_url: string }>; error?: unknown };
        if (existingData.data && existingData.data.length > 0) {
          dbExistingImageUrls = new Set(existingData.data.map((r) => r.original_url));
        } else {
          dbExistingImageUrls = new Set();
        }
      } catch (err) {
        console.log(`[scraper] DB existence check error: ${String(err)}`);
        dbExistingImageUrls = allExistingImageUrls;
      }
    }

    const skippedList = Array.from(uniqueAllowedImageUrls).filter((u) => dbExistingImageUrls.has(u));
    console.log(`[scraper] uniqueAllowed=${uniqueAllowedImageUrls.size} uniqueSkipped(before)=${skippedList.length} sampleSkipped=${skippedList.slice(0,6).join(", ")}`);
    console.log(`[scraper] sample allExisting (first 12): ${Array.from(allExistingImageUrls).slice(0,12).join(", ")}`);
    console.log(`[scraper] sample uniqueAllowed (first 12): ${Array.from(uniqueAllowedImageUrls).slice(0,12).join(", ")}`);
    const intersection = Array.from(uniqueAllowedImageUrls).filter((u) => dbExistingImageUrls.has(u));
    console.log(`[scraper] intersection sample (first 12): ${intersection.slice(0,12).join(", ")}`);

    // If we have intersection URLs, fetch DB rows for inspection (up to 50)
      if (intersection.length > 0 && db) {
      try {
        const dbRes = await db
          .from("images")
          .select("id, original_url, created_at")
          .in("original_url", intersection)
          .order("created_at", { ascending: false })
          .limit(50);
        const dbData = (dbRes as unknown) as { data?: Array<{ id?: number; original_url?: string; created_at?: string }>; error?: unknown };
        console.log(`[scraper] DB inspection for intersection (up to 50 rows): ${JSON.stringify(dbData.data?.slice(0,20) ?? [], null, 2)}`);
      } catch (err) {
        console.log(`[scraper] DB inspection error: ${String(err)}`);
      }
    }

    console.log(`[scraper] pendingImageRecords (first 12): ${pendingImageRecords.slice(0,12).map((p) => p.original_url).join(", ")}`);
    console.log(`[scraper] imagesToInsert (first 12): ${imagesToInsert.slice(0,12).map((i) => i.original_url + ' -> ' + i.storage_path).join(", ")}`);
  }
  let insertedCountTotal = 0;
  const insertedOriginalUrls = new Set<string>();
  if (!options.dryRun && dedupImagesToInsert.length > 0) {
    for (let i = 0; i < dedupImagesToInsert.length; i += imageChunkSize) {
      const chunk = dedupImagesToInsert.slice(i, i + imageChunkSize);
      let attempts = 0;
      while (attempts < 3) {
        attempts += 1;
        try {
          const res = await db!.from("images").insert(chunk).select("id, original_url");
          const insertRes = res as unknown as { data?: unknown[]; error?: unknown };
          if (insertRes.error) throw insertRes.error;
          if (Array.isArray(insertRes.data)) {
            // Collect original_url values returned by the insert so we can
            // exclude newly-inserted originals from the "skipped before" count.
            for (const row of insertRes.data as Array<Record<string, unknown>>) {
              const orig = row["original_url"];
              if (typeof orig === "string") insertedOriginalUrls.add(orig);
            }
            insertedCountTotal += insertRes.data.length;
            if (debug) {
              console.log(`[scraper] inserted chunk: count=${insertRes.data.length} totalInserted=${insertedCountTotal}`);
              try {
                const first = (insertRes.data[0] as Record<string, unknown>)?.id;
                console.log(`[scraper] sample inserted id=${String(first)}`);
              } catch {}
            }
          }
          break;
        } catch (err) {
          if (attempts >= 3) {
            console.error("Failed inserting image chunk after retries:", err);
            throw err;
          }
          // small backoff
          await new Promise((r) => setTimeout(r, 250 * attempts));
        }
      }
    }
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
  const uniqueSkipped = Array.from(uniqueAllowedImageUrls).filter((u) =>
    dbExistingImageUrls.has(u) && !insertedOriginalUrls.has(u),
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
  } as const;

  const out = formatSummaryBox(params);
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

export function formatSummaryBox(p: SummaryParams): string[] {
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
  lines.push(`Images found (unique): ${p.uniqueTotalImages}`);
  lines.push(`Supported images (unique): ${p.uniqueAllowed}`);
  lines.push(`Unsupported images (unique): ${p.uniqueUnsupported}`);
  lines.push(`Images uploaded (instances): ${p.imagesUploadedCount}`);
  lines.push(`Unique images newly inserted: ${p.imagesDbInsertedCount}`);
  lines.push(`Unique images skipped (already present before run): ${p.uniqueSkipped}`);
  lines.push(`Images failed (instances): ${p.imagesFailed}`);
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
