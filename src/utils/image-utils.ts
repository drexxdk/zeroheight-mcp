import sharp from "sharp";
import { isRecord, getProp } from "@/utils/common/typeGuards";
import { createClient } from "@supabase/supabase-js";
import { config } from "./config";
import logger from "@/utils/logger";
import { Database } from "@/generated/database-schema";

type StorageLike = {
  storage: {
    listBuckets?: () => Promise<{ data?: unknown; error?: unknown }>;
    from: (bucket: string) => {
      list: (
        path?: string,
        options?: unknown,
      ) => Promise<{ data?: unknown; error?: unknown }>;
      remove: (items: string[]) => Promise<{ error?: unknown }>;
    };
  };
};

export function isStorageLike(x: unknown): x is StorageLike {
  if (!isRecord(x)) return false;
  const storage = getProp(x, "storage");
  if (!isRecord(storage)) return false;
  const from = getProp(storage, "from");
  return typeof from === "function";
}

export async function downloadImage({
  url,
  filename,
}: {
  url: string;
  filename?: string;
}): Promise<string | null> {
  void filename;
  try {
    const controller = new AbortController();
    const timeoutMs = config.image.requestTimeoutMs;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs); // image request timeout
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.error(
        `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const buffer = await response.arrayBuffer();

    // Process image with sharp in a single pass: resize, flatten, convert to WebP.
    // Doing this in one pipeline avoids calling metadata() then processing again,
    // which halves the Sharp CPU work per image.
    let processedBuffer: Buffer;
    try {
      processedBuffer = await sharp(Buffer.from(buffer))
        .resize(config.image.maxDim, config.image.maxDim, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .webp({ quality: config.image.webpQuality })
        .toBuffer();
    } catch (error) {
      logger.error(`Invalid image data or unsupported format: ${error}`);
      return null;
    }

    // Avoid excluded formats *after* processing; if Sharp succeeded we assume it's supported.
    return processedBuffer.toString("base64");
  } catch (error) {
    logger.error(`Error downloading image ${url}:`, error);
    return null;
  }
}

export type StorageDeleteError = { batch?: number; error: unknown };

export async function clearStorageBucket({
  client,
  bucketName,
}: {
  client: ReturnType<typeof createClient<Database>> | StorageLike;
  bucketName?: string;
}): Promise<{ deletedCount: number; deleteErrors: StorageDeleteError[] }> {
  try {
    // List all files in the bucket
    let allFiles: string[] = [];
    let continuationToken: string | null = null;

    const targetBucket = bucketName || config.storage.imageBucket;

    do {
      if (isStorageLike(client)) {
        const storageClient = client;
        const { data, error } = await storageClient.storage
          .from(targetBucket)
          .list("", {
            limit: config.storage.listLimit,
            offset: continuationToken ? parseInt(continuationToken) : 0,
          });

        if (error) {
          logger.error("Error listing files:", error);
          break;
        }

        if (Array.isArray(data)) {
          const fileNames = data
            .filter(
              (item): item is Record<string, unknown> =>
                isRecord(item) && typeof getProp(item, "name") === "string",
            )
            .map((file) => String(getProp(file, "name")));
          allFiles = allFiles.concat(fileNames);
          continuationToken =
            data.length === config.storage.listLimit
              ? allFiles.length.toString()
              : null;
        } else {
          continuationToken = null;
        }
      } else {
        // can't list without a storage client
        logger.warn("No storage client available to list files");
        break;
      }
    } while (continuationToken);

    let deletedCount = 0;
    const deleteErrors: StorageDeleteError[] = [];

    if (allFiles.length > 0) {
      logger.log(`Found ${allFiles.length} files to delete`);

      // Delete files in batches
      const batchSize = config.storage.deleteBatchSize;
      for (let i = 0; i < allFiles.length; i += batchSize) {
        const batch = allFiles.slice(i, i + batchSize);

        if (isStorageLike(client)) {
          const storageClient = client;
          const { error: deleteError } = await storageClient.storage
            .from(targetBucket)
            .remove(batch);

          if (deleteError) {
            logger.error(
              `Error deleting batch ${i / batchSize + 1}:`,
              deleteError,
            );
            deleteErrors.push({ batch: i / batchSize + 1, error: deleteError });
          } else {
            deletedCount += batch.length;
            logger.log(
              `Deleted batch ${i / batchSize + 1} (${batch.length} files)`,
            );
          }
        } else {
          logger.warn("No storage client available to remove files");
          break;
        }
      }
    }

    return { deletedCount, deleteErrors };
  } catch (error) {
    logger.error("Error clearing storage bucket:", error);
    return { deletedCount: 0, deleteErrors: [{ error }] };
  }
}

export async function getBucketDebugInfo({
  client,
  bucketName,
}: {
  client: ReturnType<typeof createClient<Database>> | StorageLike;
  bucketName?: string;
}): Promise<{ buckets: string[]; files: Array<{ name: string }> }> {
  const targetBucket = bucketName || config.storage.imageBucket;
  const buckets: string[] = [];
  let files: Array<{ name: string }> = [];
  try {
    const listed = await listBucketsFromClient(client).catch(() => []);
    buckets.push(...listed);
  } catch {
    // ignore
  }

  try {
    files = await listFilesInBucket(client, targetBucket).catch(() => []);
  } catch {
    // ignore
  }

  return { buckets, files };
}

async function listBucketsFromClient(client: unknown): Promise<string[]> {
  const out: string[] = [];
  try {
    if (isRecord(client) && isRecord(getProp(client, "storage"))) {
      const storage = getProp(client, "storage");
      const listFn = getProp(storage, "listBuckets");
      if (typeof listFn === "function") {
        const bRes = await (listFn as () => Promise<unknown>)();
        if (isRecord(bRes)) {
          const maybeData = getProp(bRes, "data");
          if (Array.isArray(maybeData)) {
            for (const elem of maybeData) {
              if (isRecord(elem) && typeof getProp(elem, "name") === "string") {
                out.push(String(getProp(elem, "name")));
              }
            }
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return out;
}

async function listFilesInBucket(
  client: unknown,
  targetBucket: string,
): Promise<Array<{ name: string }>> {
  const collected: Array<{ name: string }> = [];
  try {
    if (isStorageLike(client)) {
      const storageClient = client as StorageLike;
      const { data, error } = await storageClient.storage
        .from(targetBucket)
        .list("");
      if (!error && Array.isArray(data)) {
        for (const item of data) {
          if (isRecord(item) && typeof getProp(item, "name") === "string") {
            collected.push({ name: String(getProp(item, "name")) });
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return collected;
}

export async function performBucketClear({
  clientInstance,
}: {
  clientInstance: ReturnType<typeof createClient<Database>> | null;
}): Promise<{
  bucket: string;
  foundCount: number;
  foundFiles: string[];
  availableBuckets: string[];
  deletedCount: number;
  deleteErrors: StorageDeleteError[];
}> {
  const { getSupabaseClient } = await import("./common");
  const bucketName = config.storage.imageBucket || undefined;
  const targetBucket = bucketName || config.storage.imageBucket;
  logger.log("Preparing to clear storage bucket...", bucketName || "(default)");

  const maybeClient = getSupabaseClient();

  // Prefer the explicitly provided client instance, otherwise fall back to the global client
  const storageClientToUse: ReturnType<typeof createClient<Database>> | null =
    clientInstance || maybeClient;

  // proceed with clearing the bucket
  let deleteSummary: {
    deletedCount: number;
    deleteErrors: StorageDeleteError[];
  } = {
    deletedCount: 0,
    deleteErrors: [],
  };
  try {
    if (storageClientToUse) {
      deleteSummary = await clearStorageBucket({
        client: storageClientToUse,
        bucketName: targetBucket,
      });
    }
  } catch (err) {
    logger.error("Error during storage clear:", err);
  }

  return {
    bucket: targetBucket,
    // Do not perform a separate listing - use deletedCount as a proxy for foundCount.
    foundCount: deleteSummary.deletedCount,
    foundFiles: [],
    availableBuckets: [],
    deletedCount: deleteSummary.deletedCount,
    deleteErrors: deleteSummary.deleteErrors,
  };
}
