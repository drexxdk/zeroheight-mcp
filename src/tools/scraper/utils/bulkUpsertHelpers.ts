import { isRecord, getProp } from "../../../utils/common/typeGuards";
import { toErrorObj } from "@/utils/common/errorUtils";
import logger from "@/utils/logger";
import type { ImagesType } from "@/database.types";

export async function queryExistingPages(
  db: unknown,
  uniqueUrls: string[],
): Promise<Set<string>> {
  try {
    if (typeof db !== "object" || db === null) return new Set();
    const fromProp = Reflect.get(db as object, "from");
    if (typeof fromProp !== "function") return new Set();
    const fromFn = fromProp as (table: string) => { select: (s: string) => Promise<unknown> };
    const res = await fromFn("pages").select("url").in("url", uniqueUrls) as unknown;
    const maybe = res;
    if (isRecord(maybe)) {
      const maybeData = getProp(maybe, "data");
      if (Array.isArray(maybeData))
        return new Set(maybeData.map((p) => {
          const val = getProp(p, "url");
          return typeof val === "string" ? val : "";
        }).filter(Boolean));
    }
    return new Set();
  } catch (err) {
    logger.warn("Could not query existing pages before upsert:", err);
    return new Set();
  }
}

export async function insertImageChunks(
  db: unknown,
  dedupImagesToInsert: Array<{
    page_id: number;
    original_url: ImagesType["original_url"];
    storage_path: ImagesType["storage_path"];
  }>,
  imageChunkSize: number,
  retryCfg: { maxAttempts: number; retryBaseMs: number },
): Promise<{ insertedCountTotal: number; insertedOriginalUrls: Set<string> }> {
  let insertedCountTotal = 0;
  const insertedOriginalUrls = new Set<string>();
  if (!db) return { insertedCountTotal, insertedOriginalUrls };

  for (let i = 0; i < dedupImagesToInsert.length; i += imageChunkSize) {
    const chunk = dedupImagesToInsert.slice(i, i + imageChunkSize);
    let attempts = 0;
    while (attempts < retryCfg.maxAttempts) {
      attempts += 1;
      try {
        if (typeof db !== "object" || db === null) throw new Error("No DB client");
        const fromProp = Reflect.get(db as object, "from");
        if (typeof fromProp !== "function") throw new Error("DB client missing from()");
        const insertFn = (fromProp as (table: string) => { insert: (rows: unknown) => { select: (s: string) => Promise<unknown> } })("images");
        const res = await insertFn.insert(chunk).select("id, original_url") as unknown;
        const maybeInsert = res;
        if (isRecord(maybeInsert)) {
          const insertError = getProp(maybeInsert, "error");
          if (insertError) throw insertError;
          const maybeData = getProp(maybeInsert, "data");
          if (Array.isArray(maybeData)) {
            for (const row of maybeData) {
              if (!isRecord(row)) continue;
              const orig = getProp(row, "original_url");
              if (typeof orig === "string") insertedOriginalUrls.add(orig);
            }
            insertedCountTotal += maybeData.length;
          }
        }
        break;
      } catch (err) {
        if (attempts >= retryCfg.maxAttempts) {
          logger.error("Failed inserting image chunk after retries:", err);
          throw err;
        }
        await new Promise((r) => setTimeout(r, retryCfg.retryBaseMs * attempts));
      }
    }
  }
  return { insertedCountTotal, insertedOriginalUrls };
}

export async function upsertPages(
  db: unknown,
  uniquePages: Array<{ url: string; title?: string; content?: string }>,
  pageChunkSize: number,
  dryRun: boolean | undefined,
  retryCfg: { maxAttempts: number; backoffMs: number },
): Promise<Array<{ id?: number; url?: string }>> {
  const upsertedPagesAll: Array<{ id?: number; url?: string }> = [];
  if (typeof db !== "object" || db === null) return upsertedPagesAll;

  for (let i = 0; i < uniquePages.length; i += pageChunkSize) {
    const chunk = uniquePages.slice(i, i + pageChunkSize);
    let attempts = 0;
    let chunkResult: { data?: Array<{ id?: number; url?: string }>; error?: unknown } | null = null;

    while (attempts < retryCfg.maxAttempts) {
      try {
        if (!dryRun) {
          const fromProp = Reflect.get(db as object, "from");
          if (typeof fromProp !== "function") throw new Error("DB client missing from()");
          const pagesFrom = fromProp("pages");
          const upsertCaller = Reflect.get(pagesFrom as object, "upsert");
          if (typeof upsertCaller !== "function") throw new Error("DB client missing upsert()");
          const upsertCallResult = (upsertCaller as (rows: unknown, opts?: unknown) => unknown)(chunk, { onConflict: "url" });
          const selectFn = Reflect.get(upsertCallResult as object, "select");
          if (typeof selectFn !== "function") throw new Error("DB upsert result missing select()");
          const upsertRes = await (selectFn as (s: string) => Promise<unknown>)("id, url");
          const maybe = upsertRes as unknown;
          if (isRecord(maybe)) {
            const maybeData = getProp(maybe, "data");
            let normalizedData: Array<{ id?: number; url?: string }> | undefined = undefined;
            if (Array.isArray(maybeData)) {
              normalizedData = [];
              for (const it of maybeData) {
                if (isRecord(it)) {
                  normalizedData.push({
                    id: typeof it.id === "number" ? it.id : undefined,
                    url: typeof it.url === "string" ? it.url : undefined,
                  });
                }
              }
            }
            chunkResult = { data: normalizedData, error: toErrorObj(getProp(maybe, "error")) };
          } else {
            chunkResult = { error: toErrorObj(maybe) };
          }
          if (chunkResult && !chunkResult.error) break;
        } else {
          chunkResult = { data: chunk.map((p, idx) => ({ id: i + idx + 1, url: p.url })) };
          break;
        }
      } catch (err) {
        chunkResult = { error: toErrorObj(err) };
      }
      attempts++;
      if (attempts < retryCfg.maxAttempts)
        await new Promise((r) => setTimeout(r, retryCfg.backoffMs * attempts));
    }
    if (chunkResult && Array.isArray(chunkResult.data)) upsertedPagesAll.push(...chunkResult.data);
    else if (chunkResult?.error) logger.error("Error bulk upserting pages chunk:", chunkResult.error);
  }

  return upsertedPagesAll;
}

export async function getDbExistingImageUrls(
  db: unknown,
  uniqueAllowedImageUrls: Set<string>,
  allExistingImageUrls: Set<string>,
): Promise<Set<string>> {
  let dbExistingImageUrls = allExistingImageUrls;
  try {
    if (typeof db !== "object" || db === null) return dbExistingImageUrls;
    const fromProp = Reflect.get(db as object, "from");
    if (typeof fromProp !== "function") return dbExistingImageUrls;
    const fromFn = fromProp as (table: string) => { select: (s: string) => Promise<unknown> };
    const existingRes = await fromFn("images")
      .select("original_url")
      .in("original_url", Array.from(uniqueAllowedImageUrls))
      .limit((Reflect.get(globalThis, "__config") as any)?.scraper?.db?.queryLimit ?? 50);
    const maybeExisting = existingRes as unknown;
    if (isRecord(maybeExisting)) {
      const maybeData = getProp(maybeExisting, "data");
      if (Array.isArray(maybeData)) {
        dbExistingImageUrls = new Set(
          maybeData
            .map((r) => (isRecord(r) && typeof (r as any).original_url === "string" ? (r as any).original_url : ""))
            .filter(Boolean),
        );
      } else {
        dbExistingImageUrls = new Set();
      }
    } else {
      dbExistingImageUrls = new Set();
    }
  } catch (err) {
    // Leave dbExistingImageUrls as the provided snapshot on errors
    return allExistingImageUrls;
  }
  return dbExistingImageUrls;
}

export async function computeImagesAlreadyAssociatedCount(
  db: unknown,
  imagesFoundArray: string[],
  urlToId: Set<number>,
): Promise<number> {
  let imagesAlreadyAssociatedCount = 0;
  if (!db || imagesFoundArray.length === 0) return imagesAlreadyAssociatedCount;
  try {
    for (const norm of imagesFoundArray) {
      try {
        const fromProp = Reflect.get(db as object, "from");
        if (typeof fromProp !== "function") continue;
        const res = await (fromProp as (t: string) => any)("images")
          .select("original_url, page_id")
          .ilike("original_url", `${norm}%`);
        const qdata = (res as unknown) as unknown;
        if (!isRecord(qdata)) continue;
        const data = getProp(qdata, "data");
        if (!Array.isArray(data)) continue;
        if (
          data.some(
            (r) => isRecord(r) && typeof (r as any).page_id === "number" && urlToId.has((r as any).page_id),
          )
        ) {
          imagesAlreadyAssociatedCount++;
        }
      } catch {
        // ignore per-original behavior
      }
    }
  } catch (e) {
    // ignore top-level failures and return the count so far
  }
  return imagesAlreadyAssociatedCount;
}
