import type { PagesType, ImagesType } from "@/lib/database.types";
import { getClient } from "@/lib/common/supabaseClients";

type DbClient = ReturnType<typeof getClient>["client"];

type UpsertPagesRes = {
  data?: Array<{ id?: number; url?: string }>;
  error?: unknown;
};
type InsertRes = { data?: unknown; error?: unknown };

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
        const res = await db!
          .from("pages")
          .upsert(chunk, { onConflict: "url" })
          .select("id, url");
        chunkResult = res as unknown as UpsertPagesRes;
        if (!chunkResult.error) break;
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

  // Insert images in chunks to avoid very large inserts
  const imageChunkSize = Number(process.env.SCRAPER_IMAGE_INSERT_CHUNK || 500);
  if (imagesToInsert.length > 0) {
    for (let i = 0; i < imagesToInsert.length; i += imageChunkSize) {
      const chunk = imagesToInsert.slice(i, i + imageChunkSize);
      let attempts = 0;
      let inserted = false;
      while (attempts < 3 && !inserted) {
        try {
          const res = await db!.from("images").insert(chunk);
          const insertRes = res as unknown as InsertRes;
          if (!insertRes.error) {
            inserted = true;
            break;
          }
        } catch (err) {
          console.error("Error inserting image chunk attempt:", err);
        }
        attempts++;
        if (attempts < 3)
          await new Promise((r) => setTimeout(r, 500 * attempts));
      }
      if (!inserted) {
        console.error("Failed to insert image chunk after retries");
      }
    }
  }

  const totalUniquePages = uniquePages.length;
  const existingCount = existingUrlSet.size;
  const insertedCount = Math.max(0, totalUniquePages - existingCount);
  const updatedCount = existingCount;
  const skippedCount =
    providedCount > 0 ? Math.max(0, providedCount - totalUniquePages) : 0;
  const pagesAnalyzed = /* pagesProcessed */ 0 + pagesFailed;

  const imagesUploadedCount = pendingImageRecords.length;
  const imagesDbInsertedCount = imagesToInsert.length;
  const uniqueTotalImages = uniqueAllImageUrls.size;
  const uniqueUnsupported = uniqueUnsupportedImageUrls.size;
  const uniqueAllowed = uniqueAllowedImageUrls.size;
  const uniqueSkipped = Array.from(uniqueAllowedImageUrls).filter((u) =>
    allExistingImageUrls.has(u),
  ).length;

  const lines: string[] = [];
  lines.push("Scraping Completed");
  lines.push("");
  if (providedCount > 0) lines.push(`Pages provided: ${providedCount}`);
  lines.push(`Pages analyzed: ${pagesAnalyzed}`);
  lines.push(`Pages inserted: ${insertedCount}`);
  lines.push(`Pages updated:  ${updatedCount}`);
  lines.push(`Pages skipped:  ${skippedCount}`);
  lines.push(`Pages failed:   ${pagesFailed}`);
  lines.push("");
  lines.push("");
  lines.push(`Total unique images found: ${uniqueTotalImages}`);
  lines.push(`Unsupported unique images: ${uniqueUnsupported}`);
  lines.push(`Allowed unique images: ${uniqueAllowed}`);
  lines.push(`Images uploaded (instances): ${imagesUploadedCount}`);
  lines.push(`Images skipped (unique): ${uniqueSkipped} (already uploaded).`);
  lines.push(`Images failed: ${imagesStats.failed}`);
  lines.push("");
  lines.push("");
  lines.push(
    `New associations between pages and images: ${imagesDbInsertedCount}`,
  );
  lines.push(
    `Images already associated with pages: ${imagesAlreadyAssociatedCount}`,
  );

  return { lines };
}

export default bulkUpsertPagesAndImages;
