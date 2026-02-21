import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.schema";
import type { PagesType, ImagesType } from "../../database.types";
import { isRecord } from "@/utils/common/typeGuards";
import { toErrorObj } from "@/utils/common/errorUtils";
import logger from "@/utils/logger";
import { config } from "@/utils/config";

async function upsertUniquePages(
  supabase: SupabaseClient<Database>,
  uniquePages: Array<Pick<PagesType, "url" | "title" | "content">>,
): Promise<Array<{ id?: number; url?: string }> | null> {
  try {
    let attempts = 0;
    let upsertResult: {
      data?: Array<{ id?: number; url?: string }> | null;
      error?: { message?: string } | null;
    } = { data: null, error: null };
    while (attempts < 3) {
      try {
        const res = await supabase
          .from("pages")
          .upsert(uniquePages, { onConflict: "url" })
          .select("id, url");
        upsertResult = res;
        if (!res.error) break;
      } catch (err) {
        upsertResult = { error: toErrorObj(err), data: null };
      }
      attempts++;
      if (attempts < 3) {
        await new Promise((r) =>
          setTimeout(r, config.scraper.db.bulkUpsertBackoffMs),
        );
      }
    }
    if (upsertResult.error)
      logger.error("Error bulk upserting pages:", upsertResult.error);
    return upsertResult.data || null;
  } catch (e) {
    logger.error("Unexpected error upserting pages:", e);
    return null;
  }
}

async function insertImagesWithRetry(
  supabase: SupabaseClient<Database>,
  imagesToInsert: Array<{
    page_id: number;
    original_url: ImagesType["original_url"];
    storage_path: ImagesType["storage_path"];
  }>,
): Promise<void> {
  try {
    let attempts = 0;
    let insertResult: unknown = null;
    while (attempts < 3) {
      try {
        const res = await supabase.from("images").insert(imagesToInsert);
        insertResult = res;
        if (!res.error) break;
      } catch (err) {
        insertResult = { error: toErrorObj(err) };
      }
      attempts++;
      if (attempts < 3) {
        await new Promise((r) =>
          setTimeout(r, config.scraper.db.bulkUpsertBackoffMs),
        );
      }
    }
    let insertImagesError: { message?: string } | null = null;
    if (isRecord(insertResult)) insertImagesError = insertResult.error ?? null;
    if (insertImagesError)
      logger.error("Error bulk inserting images:", insertImagesError);
  } catch (e) {
    logger.error("Unexpected error inserting images:", e);
  }
}

export async function commitPagesAndImages(options: {
  client: SupabaseClient<Database>;
  pagesToUpsert: Array<Pick<PagesType, "url" | "title" | "content">>;
  pendingImageRecords: Array<{
    pageUrl: string;
    original_url: ImagesType["original_url"];
    storage_path: ImagesType["storage_path"];
  }>;
}): Promise<{ pagesUpserted: number; imagesInserted: number }> {
  const { client: supabase, pagesToUpsert, pendingImageRecords } = options;
  // Deduplicate pages
  const pageMap = new Map<
    string,
    Pick<PagesType, "url" | "title" | "content">
  >();
  for (const p of pagesToUpsert) pageMap.set(p.url, p);
  const uniquePages = Array.from(pageMap.values());
  const upsertedPages = await upsertUniquePages(supabase, uniquePages);

  const urlToId = new Map<string, number>();
  (upsertedPages || []).forEach((p) => {
    if (p && p.url && p.id) urlToId.set(p.url, p.id);
  });

  const imagesToInsert: Array<{
    page_id: number;
    original_url: ImagesType["original_url"];
    storage_path: ImagesType["storage_path"];
  }> = [];
  for (const r of pendingImageRecords) {
    const page_id = urlToId.get(r.pageUrl);
    if (!page_id) continue;
    imagesToInsert.push({
      page_id,
      original_url: r.original_url,
      storage_path: r.storage_path,
    });
  }

  if (imagesToInsert.length > 0) {
    await insertImagesWithRetry(supabase, imagesToInsert);
  }

  return {
    pagesUpserted: upsertedPages?.length || 0,
    imagesInserted: imagesToInsert.length,
  };
}
