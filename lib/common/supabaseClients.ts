import { getSupabaseClient, getSupabaseAdminClient } from "../common";
import { IMAGE_BUCKET } from "../config";

// Provide a single wrapper that exposes the regular client and a storage helper
// which will prefer admin capabilities when an admin client is available.
export function getClient() {
  const client = getSupabaseClient();
  const adminClient = getSupabaseAdminClient();

  const storage = {
    // upload a buffer to the configured bucket
    upload: async (filename: string, file: Buffer) => {
      if (adminClient) {
          return await adminClient.storage
            .from(IMAGE_BUCKET)
            .upload(filename, file, {
              cacheControl: "3600",
              upsert: true,
              contentType: "image/jpeg",
            });
        }
        return await client!.storage
          .from(IMAGE_BUCKET)
          .upload(filename, file, {
            cacheControl: "3600",
            upsert: true,
            contentType: "image/jpeg",
          });
    },
    // list buckets only available with admin client
    listBuckets: adminClient
      ? async () => await adminClient.storage.listBuckets()
      : undefined,
    // create bucket only available with admin client
    createBucket: adminClient
      ? async (
          name: string,
          opts: {
            public: boolean;
            fileSizeLimit?: string | number | null;
            allowedMimeTypes?: string[] | null;
          },
        ) => await adminClient.storage.createBucket(name, opts)
      : undefined,
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
