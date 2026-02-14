import type { PagesType, ImagesType } from "../../database.types";
import { getClient } from "../../common/supabaseClients";

type DbClient = ReturnType<typeof getClient>["client"];

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
}) {
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

  // Before upserting, check which of the unique pages already exist so we can
  // report inserted vs updated counts accurately.
  const uniqueUrls = uniquePages.map((p) => p.url);
  let existingPagesBefore: Array<{ url?: string } | null> = [];
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
    existingPagesBefore.map((p) => (p?.url ? p.url : "")).filter(Boolean),
  );

  // Manual retry loop for upserting pages
  let upsertResult: {
    data: Array<{ id?: number; url?: string }> | null;
    error: unknown | null;
  } = { data: null, error: null };
  {
    let attempts = 0;
    while (attempts < 3) {
      try {
        const res = await db!
          .from("pages")
          .upsert(uniquePages, { onConflict: "url" })
          .select("id, url");
        upsertResult = res as unknown as typeof upsertResult;
        const maybeError = (res as unknown as { error?: unknown }).error;
        if (!maybeError) break;
      } catch (err) {
        upsertResult = { error: err, data: null };
      }
      attempts++;
      if (attempts < 3) await new Promise((r) => setTimeout(r, 500));
    }
  }

  const { data: upsertedPages, error: upsertError } = upsertResult as {
    data: Array<{ id?: number; url?: string }> | null;
    error: unknown | null;
  };

  if (upsertError) {
    console.error("Error bulk upserting pages:", upsertError);
  }

  // Map url -> id for image inserts
  const urlToId = new Map<string, number>();
  (upsertedPages || []).forEach((p) => {
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
      const matchedByNormalized = new Map<
        string,
        Array<{ original_url?: string; page_id?: number | null }>
      >();

      for (const norm of imagesFoundArray) {
        try {
          const { data: qdata, error: qerr } = await db!
            .from("images")
            .select("original_url, page_id")
            .ilike("original_url", `${norm}%`);
          if (qerr) continue;
          if (qdata && qdata.length > 0)
            matchedByNormalized.set(
              norm,
              qdata as Array<{
                original_url?: string;
                page_id?: number | null;
              }>,
            );
        } catch {
          // continue
        }
      }

      let matchCount = 0;
      for (const rows of matchedByNormalized.values()) {
        if (
          rows.some(
            (r) => typeof r.page_id === "number" && pageIdSet.has(r.page_id),
          )
        )
          matchCount++;
      }
      imagesAlreadyAssociatedCount = matchCount;
    }
  } catch (e) {
    console.warn("DEBUG: failed to compute imagesAlreadyAssociatedCount:", e);
  }

  // Insert images in bulk (retry loop)
  if (imagesToInsert.length > 0) {
    let insertResult: { data: unknown | null; error: unknown | null } = {
      data: null,
      error: null,
    };
    {
      let attempts = 0;
      while (attempts < 3) {
        try {
          const res = await db!.from("images").insert(imagesToInsert);
          insertResult = res as unknown as typeof insertResult;
          const maybeError = (res as unknown as { error?: unknown }).error;
          if (!maybeError) break;
        } catch (err) {
          insertResult = { error: err, data: null };
        }
        attempts++;
        if (attempts < 3) await new Promise((r) => setTimeout(r, 500));
      }
    }
    const { error: insertImagesError } = insertResult as {
      error: unknown | null;
    };
    if (insertImagesError) {
      console.error("Error bulk inserting images:", insertImagesError);
    }
  }

  const totalUniquePages = uniquePages.length;
  const existingCount = existingUrlSet.size;
  const insertedCount = Math.max(0, totalUniquePages - existingCount);
  const updatedCount = existingCount;
  const skippedCount =
    providedCount > 0 ? Math.max(0, providedCount - totalUniquePages) : 0;
  const pagesAnalyzed = /* pagesProcessed */ 0 + pagesFailed; // caller prints processed count separately

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
