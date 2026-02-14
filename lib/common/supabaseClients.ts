import { getSupabaseClient } from "../common";
import { IMAGE_BUCKET } from "../config";

// Provide a single wrapper that exposes the regular client and a storage helper
// which will prefer admin capabilities when an admin client is available.
export function getClient() {
  const client = getSupabaseClient();

  const storage = {
    // upload a buffer to the configured bucket
    upload: async (filename: string, file: Buffer) => {
      return await client!.storage.from(IMAGE_BUCKET).upload(filename, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: "image/jpeg",
      });
    },
    // list/create buckets are not available without admin privileges
    listBuckets: undefined,
    createBucket: undefined,
  };

  return { client, storage };
}

// Simple runtime invariant check for progress tracking
export function checkProgressInvariant(
  overallProgress: { current: number; total: number },
  context?: string,
) {
  if (overallProgress.current > overallProgress.total) {
    console.warn(
      `⚠️ Progress invariant violated${context ? ` (${context})` : ""}: current (${overallProgress.current}) > total (${overallProgress.total})`,
    );
  }
  if (overallProgress.current < 0) {
    console.warn(
      `⚠️ Progress invariant violated${context ? ` (${context})` : ""}: current is negative (${overallProgress.current})`,
    );
  }
  if (overallProgress.total < 0) {
    console.warn(
      `⚠️ Progress invariant violated${context ? ` (${context})` : ""}: total is negative (${overallProgress.total})`,
    );
  }
}
