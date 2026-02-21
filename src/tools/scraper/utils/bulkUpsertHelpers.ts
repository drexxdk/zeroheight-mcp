import { isRecord, getProp } from "../../../utils/common/typeGuards";
import { toErrorObj } from "@/utils/common/errorUtils";
import logger from "@/utils/logger";
import { config } from "@/utils/config";
import type { ImagesType } from "@/database.types";

export async function queryExistingPages(
  db: unknown,
  uniqueUrls: string[],
): Promise<Set<string>> {
  try {
    if (typeof db !== "object" || db === null) return new Set();
    const fromProp = Reflect.get(db as object, "from");
    if (typeof fromProp !== "function") return new Set();
    const fromFn = fromProp as (table: string) => unknown;
    const pagesFrom = fromFn("pages") as unknown;
    const selectFn = Reflect.get(pagesFrom as object, "select");
    if (typeof selectFn !== "function") return new Set();
    const selectRes = (selectFn as (s: string) => Promise<unknown>).call(
      pagesFrom,
      "url",
    );
    const inFn = Reflect.get(selectRes as object, "in");
    const maybe =
      inFn && typeof inFn === "function"
        ? await (inFn as (k: string, v: unknown) => Promise<unknown>).call(
            selectRes,
            "url",
            uniqueUrls,
          )
        : await selectRes;
    if (isRecord(maybe)) {
      const maybeData = getProp(maybe, "data");
      if (Array.isArray(maybeData))
        return new Set(
          maybeData
            .map((p) => {
              const val = getProp(p, "url");
              return typeof val === "string" ? val : "";
            })
            .filter(Boolean),
        );
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
        if (typeof db !== "object" || db === null)
          throw new Error("No DB client");
        const fromProp = Reflect.get(db as object, "from");
        if (typeof fromProp !== "function")
          throw new Error("DB client missing from()");
        const insertFn = (
          fromProp as (table: string) => {
            insert: (rows: unknown) => {
              select: (s: string) => Promise<unknown>;
            };
          }
        )("images");
        const res = (await insertFn
          .insert(chunk)
          .select("id, original_url")) as unknown;
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
        await new Promise((r) =>
          setTimeout(r, retryCfg.retryBaseMs * attempts),
        );
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

  async function normalizeUpsertResult(
    maybe: unknown,
  ): Promise<{ data?: Array<{ id?: number; url?: string }>; error?: unknown }> {
    if (isRecord(maybe)) {
      const maybeData = getProp(maybe, "data");
      let normalizedData: Array<{ id?: number; url?: string }> | undefined =
        undefined;
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
      return {
        data: normalizedData,
        error: toErrorObj(getProp(maybe, "error")),
      };
    }
    return { error: toErrorObj(maybe) };
  }

  async function performUpsertChunk(
    dbClient: unknown,
    chunk: Array<{ url: string; title?: string; content?: string }>,
    baseIndex: number,
    dry: boolean | undefined,
  ): Promise<{ data?: Array<{ id?: number; url?: string }>; error?: unknown }> {
    let attempts = 0;
    let chunkResult: {
      data?: Array<{ id?: number; url?: string }>;
      error?: unknown;
    } | null = null;
    while (attempts < retryCfg.maxAttempts) {
      try {
        if (!dry) {
          const fromProp = Reflect.get(dbClient as object, "from");
          if (typeof fromProp !== "function")
            throw new Error("DB client missing from()");
          const pagesFrom = fromProp("pages");
          const upsertCaller = Reflect.get(pagesFrom as object, "upsert");
          if (typeof upsertCaller !== "function")
            throw new Error("DB client missing upsert()");
          const upsertCallResult = (
            upsertCaller as (rows: unknown, opts?: unknown) => unknown
          )(chunk, { onConflict: "url" });
          const selectFn = Reflect.get(upsertCallResult as object, "select");
          if (typeof selectFn !== "function")
            throw new Error("DB upsert result missing select()");
          const upsertRes = await (selectFn as (s: string) => Promise<unknown>)(
            "id, url",
          );
          chunkResult = await normalizeUpsertResult(upsertRes as unknown);
          if (chunkResult && !chunkResult.error) break;
        } else {
          chunkResult = {
            data: chunk.map((p, idx) => ({
              id: baseIndex + idx + 1,
              url: p.url,
            })),
          };
          break;
        }
      } catch (err) {
        chunkResult = { error: toErrorObj(err) };
      }
      attempts++;
      if (attempts < retryCfg.maxAttempts)
        await new Promise((r) => setTimeout(r, retryCfg.backoffMs * attempts));
    }
    return chunkResult ?? { error: new Error("upsert chunk failed") };
  }

  for (let i = 0; i < uniquePages.length; i += pageChunkSize) {
    const chunk = uniquePages.slice(i, i + pageChunkSize);
    const chunkResult = await performUpsertChunk(db, chunk, i, dryRun);
    if (chunkResult && Array.isArray(chunkResult.data))
      upsertedPagesAll.push(...chunkResult.data);
    else if (chunkResult?.error)
      logger.error("Error bulk upserting pages chunk:", chunkResult.error);
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
    const fromFn = fromProp as (table: string) => unknown;
    const imagesFrom = fromFn("images") as unknown;
    const selectFn = Reflect.get(imagesFrom as object, "select");
    if (typeof selectFn !== "function") return allExistingImageUrls;
    const selectRes = (selectFn as (s: string) => Promise<unknown>).call(
      imagesFrom,
      "original_url",
    );
    const inFn = Reflect.get(selectRes as object, "in");
    const limitFn = Reflect.get(selectRes as object, "limit");
    const withIn =
      inFn && typeof inFn === "function"
        ? await (inFn as (k: string, v: unknown) => Promise<unknown>).call(
            selectRes,
            "original_url",
            Array.from(uniqueAllowedImageUrls),
          )
        : await selectRes;
    const maybeExisting =
      limitFn && typeof limitFn === "function"
        ? await (limitFn as (n: number) => Promise<unknown>).call(
            withIn,
            config.scraper.db.queryLimit,
          )
        : (withIn as unknown);
    if (isRecord(maybeExisting)) {
      const maybeData = getProp(maybeExisting, "data");
      if (Array.isArray(maybeData)) {
        dbExistingImageUrls = new Set(
          maybeData
            .map((r) => {
              const val = getProp(r, "original_url");
              return typeof val === "string" ? val : "";
            })
            .filter(Boolean),
        );
      } else {
        dbExistingImageUrls = new Set();
      }
    } else {
      dbExistingImageUrls = new Set();
    }
  } catch (_err) {
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
        const fromFn = fromProp as (table: string) => unknown;
        const imagesFrom = fromFn("images") as unknown;
        const selFn = Reflect.get(imagesFrom as object, "select");
        if (typeof selFn !== "function") continue;
        const selectRes = (selFn as (s: string) => unknown).call(
          imagesFrom,
          "original_url, page_id",
        );
        const ilikeFn = Reflect.get(selectRes as object, "ilike");
        const qres =
          ilikeFn && typeof ilikeFn === "function"
            ? await (
                ilikeFn as (k: string, v: string) => Promise<unknown>
              ).call(selectRes, "original_url", `${norm}%`)
            : await (selectRes as Promise<unknown>);
        const qdata = qres as unknown;
        if (!isRecord(qdata)) continue;
        const data = getProp(qdata, "data");
        if (!Array.isArray(data)) continue;
        if (
          data.some((r) => {
            if (!isRecord(r)) return false;
            const pid = getProp(r, "page_id");
            return typeof pid === "number" && urlToId.has(pid);
          })
        ) {
          imagesAlreadyAssociatedCount++;
        }
      } catch {
        // ignore per-original behavior
      }
    }
  } catch (_e) {
    // ignore top-level failures and return the count so far
  }
  return imagesAlreadyAssociatedCount;
}

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

export function buildSummaryParams(opts: {
  providedCount: number;
  uniquePages: Array<{ url: string; title?: string; content?: string }>;
  existingUrlSet: Set<string>;
  pagesFailed: number;
  uniqueAllImageUrls: Set<string>;
  uniqueUnsupportedImageUrls: Set<string>;
  uniqueAllowedImageUrls: Set<string>;
  imagesStats: {
    processed: number;
    uploaded: number;
    skipped: number;
    failed: number;
  };
  insertedCountTotal: number;
  insertedOriginalUrls: Set<string>;
  imagesAlreadyAssociatedCount: number;
  dbExistingImageUrls: Set<string>;
}): SummaryParams {
  const {
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
  } = opts;

  const totalUniquePages = uniquePages.length;
  const existingCount = existingUrlSet.size;
  const insertedCount = Math.max(0, totalUniquePages - existingCount);
  const updatedCount = existingCount;
  const skippedCount =
    providedCount > 0 ? Math.max(0, providedCount - totalUniquePages) : 0;
  const pagesAnalyzed =
    providedCount > 0 ? providedCount : totalUniquePages + pagesFailed;

  const imagesUploadedCount = imagesStats.uploaded;
  const imagesDbInsertedCount = insertedCountTotal;
  const uniqueTotalImages = uniqueAllImageUrls.size;
  const uniqueUnsupported = uniqueUnsupportedImageUrls.size;
  const uniqueAllowed = uniqueAllowedImageUrls.size;
  const uniqueSkipped = Array.from(uniqueAllowedImageUrls).filter(
    (u) => dbExistingImageUrls.has(u) && !insertedOriginalUrls.has(u),
  ).length;

  return {
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
}

export async function inspectDbForIntersection(
  db: unknown,
  intersection: string[],
  pendingImageRecords: Array<{
    pageUrl: string;
    original_url: ImagesType["original_url"];
    storage_path: ImagesType["storage_path"];
  }>,
  imagesToInsert: Array<{
    page_id: number;
    original_url: ImagesType["original_url"];
    storage_path: ImagesType["storage_path"];
  }>,
): Promise<void> {
  try {
    logger.debug(
      `[debug] intersection sample (first ${config.scraper.log.sampleSize}): ${intersection
        .slice(0, config.scraper.log.sampleSize)
        .join(", ")}`,
    );

    // If we have intersection URLs, fetch DB rows for inspection (up to configured limit)
    if (intersection.length > 0 && db) {
      try {
        const fromProp = Reflect.get(db as object, "from");
        if (typeof fromProp === "function") {
          const fromFn = fromProp as (table: string) => unknown;
          const imagesFrom = fromFn("images") as unknown;
          const selectFn = Reflect.get(imagesFrom as object, "select");
          if (typeof selectFn !== "function") throw new Error("select missing");
          const selectRes = (selectFn as (s: string) => unknown).call(
            imagesFrom,
            "id, original_url, created_at",
          );
          const inFn = Reflect.get(selectRes as object, "in");
          const orderFn = Reflect.get(selectRes as object, "order");
          const limitFn = Reflect.get(selectRes as object, "limit");
          const withIn =
            inFn && typeof inFn === "function"
              ? await (
                  inFn as (k: string, v: unknown) => Promise<unknown>
                ).call(selectRes, "original_url", intersection)
              : await (selectRes as Promise<unknown>);
          const withOrder =
            orderFn && typeof orderFn === "function"
              ? (orderFn as (f: string, opts?: unknown) => unknown).call(
                  withIn,
                  "created_at",
                  { ascending: false },
                )
              : withIn;
          const dbRes =
            limitFn && typeof limitFn === "function"
              ? await (limitFn as (n: number) => Promise<unknown>).call(
                  withOrder,
                  config.scraper.db.inspectLimit,
                )
              : (withOrder as unknown);
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
              ` [debug] DB inspection for intersection (up to ${config.scraper.db.inspectLimit} rows): []`,
            );
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
  } catch (err) {
    logger.debug(`[debug] DB inspection error: ${String(err)}`);
  }
}

export function prepareImagesToInsert(
  pendingImageRecords: Array<{
    pageUrl: string;
    original_url: ImagesType["original_url"];
    storage_path: ImagesType["storage_path"];
  }>,
  urlToId: Map<string, number>,
): Array<{
  page_id: number;
  original_url: ImagesType["original_url"];
  storage_path: ImagesType["storage_path"];
}> {
  const out: Array<{
    page_id: number;
    original_url: ImagesType["original_url"];
    storage_path: ImagesType["storage_path"];
  }> = [];
  for (const r of pendingImageRecords) {
    const page_id = urlToId.get(r.pageUrl);
    if (!page_id) continue;
    out.push({
      page_id,
      original_url: r.original_url,
      storage_path: r.storage_path,
    });
  }
  return out;
}

export function dedupeImagesByKey(
  images: Array<{
    page_id: number;
    original_url: ImagesType["original_url"];
    storage_path: ImagesType["storage_path"];
  }>,
): Array<{
  page_id: number;
  original_url: ImagesType["original_url"];
  storage_path: ImagesType["storage_path"];
}> {
  const seen = new Set<string>();
  const dedup: Array<{
    page_id: number;
    original_url: ImagesType["original_url"];
    storage_path: ImagesType["storage_path"];
  }> = [];
  for (const img of images) {
    const key = `${img.original_url}||${img.storage_path}`;
    if (!seen.has(key)) {
      seen.add(key);
      dedup.push(img);
    }
  }
  return dedup;
}

export async function performImageInsertFlow(opts: {
  db: unknown;
  pendingImageRecords: Array<{
    pageUrl: string;
    original_url: ImagesType["original_url"];
    storage_path: ImagesType["storage_path"];
  }>;
  imagesToInsert: Array<{
    page_id: number;
    original_url: ImagesType["original_url"];
    storage_path: ImagesType["storage_path"];
  }>;
  dedupImagesToInsert: Array<{
    page_id: number;
    original_url: ImagesType["original_url"];
    storage_path: ImagesType["storage_path"];
  }>;
  uniqueAllowedImageUrls: Set<string>;
  allExistingImageUrls: Set<string>;
  imageChunkSize: number;
  urlToId: Map<string, number>;
  dryRun?: boolean;
  retryCfg: { maxAttempts: number; retryBaseMs: number };
}): Promise<{
  insertedCountTotal: number;
  insertedOriginalUrls: Set<string>;
  dbExistingImageUrls: Set<string>;
  imagesAlreadyAssociatedCount: number;
}> {
  const {
    db,
    pendingImageRecords,
    imagesToInsert,
    dedupImagesToInsert,
    uniqueAllowedImageUrls,
    allExistingImageUrls,
    imageChunkSize,
    urlToId,
    dryRun,
    retryCfg,
  } = opts;

  const imagesFoundArray = Array.from(uniqueAllowedImageUrls);
  const pageIdSet = new Set<number>(Array.from(urlToId.values()));
  const imagesAlreadyAssociatedCount =
    await computeImagesAlreadyAssociatedCount(db, imagesFoundArray, pageIdSet);

  const debug = config.scraper.debug;
  if (debug)
    logger.debug(
      `[debug] image insert: pendingRecords=${pendingImageRecords.length} imagesToInsert=${imagesToInsert.length} dedup=${dedupImagesToInsert.length} allExisting=${allExistingImageUrls.size}`,
    );
  else
    logger.log(
      `image insert: pendingRecords=${pendingImageRecords.length} imagesToInsert=${imagesToInsert.length} dedup=${dedupImagesToInsert.length} allExisting=${allExistingImageUrls.size}`,
    );

  const dbExistingImageUrls = await getDbExistingImageUrls(
    db,
    uniqueAllowedImageUrls,
    allExistingImageUrls,
  );

  try {
    const intersection = Array.from(uniqueAllowedImageUrls).filter((u) =>
      dbExistingImageUrls.has(u),
    );
    if (debug && intersection.length > 0) {
      await inspectDbForIntersection(
        db,
        intersection,
        pendingImageRecords,
        imagesToInsert,
      );
    }
  } catch (err) {
    logger.debug(`[debug] DB inspection error: ${String(err)}`);
  }

  let insertedCountTotal = 0;
  const insertedOriginalUrls = new Set<string>();
  if (!dryRun && dedupImagesToInsert.length > 0) {
    const res = await insertImageChunks(
      db,
      dedupImagesToInsert,
      imageChunkSize,
      retryCfg,
    );
    insertedCountTotal = res.insertedCountTotal;
    for (const u of res.insertedOriginalUrls) insertedOriginalUrls.add(u);
  } else {
    insertedCountTotal = dedupImagesToInsert.length;
  }

  return {
    insertedCountTotal,
    insertedOriginalUrls,
    dbExistingImageUrls,
    imagesAlreadyAssociatedCount,
  };
}
