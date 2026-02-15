import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.schema";
import {
  EXCLUDE_IMAGE_FORMATS,
  IMAGE_MAX_DIM,
  IMAGE_JPEG_QUALITY,
  IMAGE_BUCKET,
} from "./config";

export async function downloadImage(
  url: string,
  _filename: string, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(
        `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const contentType = response.headers.get("content-type") || "";

    const buffer = await response.arrayBuffer();

    // First try to validate with Sharp - this will tell us if it's actually a valid image
    let metadata;
    try {
      metadata = await sharp(Buffer.from(buffer)).metadata();
    } catch (error) {
      console.error(`Invalid image data or unsupported format: ${error}`);
      // If it's not a valid image according to Sharp, skip it
      if (!contentType.startsWith("image/")) {
        console.log(`Skipping non-image content: ${contentType}`);
        return null;
      }
      // If content-type says it's an image but Sharp can't process it, still skip
      return null;
    }

    // Skip excluded formats from configuration
    const fmt = (metadata.format || "").toLowerCase();
    if (EXCLUDE_IMAGE_FORMATS.includes(fmt)) {
      return null;
    }

    // Process image with sharp: resize to max 600x600, convert to JPEG, optimize
    const processedBuffer = await sharp(Buffer.from(buffer))
      .resize(IMAGE_MAX_DIM, IMAGE_MAX_DIM, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: { r: 255, g: 255, b: 255 } }) // Fill transparent areas with white
      .jpeg({ quality: IMAGE_JPEG_QUALITY })
      .toBuffer();

    return processedBuffer.toString("base64");
  } catch (error) {
    console.error(`Error downloading image ${url}:`, error);
    return null;
  }
}

export async function clearStorageBucket(
  client: ReturnType<typeof createClient<Database>>,
  bucketName?: string,
): Promise<{ deletedCount: number; deleteErrors: unknown[] }> {
  try {
    // List all files in the bucket
    let allFiles: string[] = [];
    let continuationToken: string | null = null;

    const targetBucket = bucketName || IMAGE_BUCKET || "zeroheight-images";

    do {
      const { data, error } = await client.storage.from(targetBucket).list("", {
        limit: 1000,
        offset: continuationToken ? parseInt(continuationToken) : 0,
      });

      if (error) {
        console.error("Error listing files:", error);
        break;
      }

      if (data) {
        const fileNames = data.map((file: { name: string }) => file.name);
        allFiles = allFiles.concat(fileNames);
        continuationToken =
          data.length === 1000 ? allFiles.length.toString() : null;
      } else {
        continuationToken = null;
      }
    } while (continuationToken);

    let deletedCount = 0;
    const deleteErrors: unknown[] = [];

    if (allFiles.length > 0) {
      console.log(`Found ${allFiles.length} files to delete`);

      // Delete files in batches
      const batchSize = 100;
      for (let i = 0; i < allFiles.length; i += batchSize) {
        const batch = allFiles.slice(i, i + batchSize);

        const { error: deleteError } = await client.storage
          .from(targetBucket)
          .remove(batch);

        if (deleteError) {
          console.error(
            `Error deleting batch ${i / batchSize + 1}:`,
            deleteError,
          );
          deleteErrors.push({ batch: i / batchSize + 1, error: deleteError });
        } else {
          deletedCount += batch.length;
          console.log(
            `Deleted batch ${i / batchSize + 1} (${batch.length} files)`,
          );
        }
      }
    }

    return { deletedCount, deleteErrors };
  } catch (error) {
    console.error("Error clearing storage bucket:", error);
    return { deletedCount: 0, deleteErrors: [error] };
  }
}

export async function getBucketDebugInfo(
  client: ReturnType<typeof createClient<Database>>,
  bucketName?: string,
): Promise<{ buckets: string[]; files: Array<{ name: string }> }> {
  const targetBucket = bucketName || IMAGE_BUCKET || "zeroheight-images";
  const buckets: string[] = [];
  let files: Array<{ name: string }> = [];

  try {
    // Try listing buckets (may require admin client)
    const maybe = client as unknown as {
      storage?: {
        listBuckets?: () => Promise<{
          data?: Array<{ name: string }>;
          error?: unknown;
        }>;
      };
    };

    if (maybe.storage && typeof maybe.storage.listBuckets === "function") {
      try {
        const bRes = await maybe.storage.listBuckets();
        if (!bRes.error && Array.isArray(bRes.data)) {
          buckets.push(...(bRes.data.map((b) => b.name) || []));
        }
      } catch {
        // ignore bucket listing errors
      }
    }

    // List files in the target bucket
    try {
      const { data, error } = await client.storage.from(targetBucket).list("");
      if (!error && Array.isArray(data)) {
        files = data as Array<{ name: string }>;
      }
    } catch {
      // ignore file listing errors
    }
  } catch {
    // ignore overall errors
  }

  return { buckets, files };
}

export async function performBucketClear(
  clientInstance: ReturnType<typeof createClient<Database>> | null,
): Promise<{
  bucket: string;
  foundCount: number;
  foundFiles: string[];
  availableBuckets: string[];
  deletedCount: number;
  deleteErrors: unknown[];
}> {
  const { getSupabaseClient } = await import("./common");
  const bucketName = IMAGE_BUCKET || undefined;
  const targetBucket = bucketName || IMAGE_BUCKET;
  console.log(
    "Preparing to clear storage bucket...",
    bucketName || "(default)",
  );

  const maybeClient = getSupabaseClient();

  // Prefer the explicitly provided client instance, otherwise fall back to the global client
  const storageClientToUse = (clientInstance || maybeClient) as ReturnType<
    typeof createClient<Database>
  > | null;

  const buckets: string[] = [];
  const files: Array<{ name: string }> = [];

  // Gather debug info about the bucket/files (helps explain zero-results)
  try {
    if (storageClientToUse) {
      const debug = await getBucketDebugInfo(storageClientToUse, targetBucket);
      buckets.push(...debug.buckets);
      files.push(...debug.files);
    } else {
      console.warn("No Supabase client available to list buckets/files");
    }
  } catch (err) {
    console.error("Error getting bucket debug info:", err);
  }

  // proceed with clearing the bucket
  let deleteSummary = { deletedCount: 0, deleteErrors: [] as unknown[] };
  try {
    if (storageClientToUse) {
      deleteSummary = await clearStorageBucket(
        storageClientToUse,
        targetBucket,
      );
    }
  } catch (err) {
    console.error("Error during storage clear:", err);
  }

  return {
    bucket: targetBucket,
    foundCount: files.length,
    foundFiles: files.slice(0, 50).map((f) => f.name),
    availableBuckets: buckets,
    deletedCount: deleteSummary.deletedCount,
    deleteErrors: deleteSummary.deleteErrors,
  };
}
