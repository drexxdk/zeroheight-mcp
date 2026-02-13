import type { SupabaseClientMinimal, SupabaseResult } from "./scraperHelpers";
import { retryAsync } from "./scraperHelpers";

export async function commitPagesAndImages(options: {
  client: unknown; // will be cast to SupabaseClientMinimal by caller
  pagesToUpsert: Array<{ url: string; title: string; content: string }>;
  pendingImageRecords: Array<{
    pageUrl: string;
    original_url: string;
    storage_path: string;
  }>;
}) {
  const { client, pagesToUpsert, pendingImageRecords } = options;
  // Deduplicate pages
  const pageMap = new Map<
    string,
    { url: string; title: string; content: string }
  >();
  for (const p of pagesToUpsert) pageMap.set(p.url, p);
  const uniquePages = Array.from(pageMap.values());

  let upsertedPages: Array<{ id?: number; url?: string }> | null = null;
  try {
    const upsertResult = (await retryAsync(
      () =>
        (client as unknown as SupabaseClientMinimal)
          .from("pages")
          .upsert(uniquePages, { onConflict: "url" })
          .select("id, url"),
      3,
      500,
    ).catch((e) => ({ error: e, data: null }))) as SupabaseResult<
      Array<{ id?: number; url?: string }>
    >;
    if (upsertResult.error) {
      console.error("Error bulk upserting pages:", upsertResult.error);
    }
    upsertedPages = upsertResult.data || null;
  } catch (e) {
    console.error("Unexpected error upserting pages:", e);
  }

  const urlToId = new Map<string, number>();
  (upsertedPages || []).forEach((p) => {
    if (p && p.url && p.id) urlToId.set(p.url, p.id);
  });

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
    original_url: string;
    storage_path: string;
  }>;

  if (imagesToInsert.length > 0) {
    try {
      const insertResult = await retryAsync(
        () =>
          (client as unknown as SupabaseClientMinimal)
            .from("images")
            .insert(imagesToInsert),
        3,
        500,
      ).catch((e) => ({ error: e }));
      const { error: insertImagesError } =
        insertResult as SupabaseResult<unknown>;
      if (insertImagesError) {
        console.error("Error bulk inserting images:", insertImagesError);
      }
    } catch (e) {
      console.error("Unexpected error inserting images:", e);
    }
  }

  return {
    pagesUpserted: upsertedPages?.length || 0,
    imagesInserted: imagesToInsert.length,
  };
}
