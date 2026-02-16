import { getSupabaseClient, getSupabaseAdminClient } from "../common";
import { IMAGE_BUCKET } from "../config";

// Provide a single wrapper that exposes the regular client and a storage helper
// which will prefer admin capabilities when an admin client is available.
export function getClient() {
  const client = getSupabaseClient();
  const admin = getSupabaseAdminClient();

  const storage = {
    // upload a buffer to the configured bucket; prefer admin client when available
    upload: async (filename: string, file: Buffer) => {
      const svc = admin ?? client!;
      return await svc.storage.from(IMAGE_BUCKET).upload(filename, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: "image/jpeg",
      });
    },
    // list/create buckets are only available with admin privileges
    listBuckets: admin
      ? async () => await admin.storage.listBuckets()
      : undefined,
    // createBucket uses admin-only storage API. The runtime shape of `opts`
    // is compatible with the client but the exact param type depends on
    // the Supabase client types; cast with a narrow, documented shape and
    // use an eslint exception for the explicit any used in the call.
    createBucket: admin
      ? async (
          name: string,
          opts: {
            public?: boolean;
            allowedMimeTypes?: string[] | null;
            fileSizeLimit?: string | number | null;
            type?: unknown;
          },
        ) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return await admin.storage.createBucket(name as string, opts as any);
        }
      : undefined,
  };

  return { client, storage };
}

// Simple runtime invariant check for progress tracking
export function checkProgressInvariant({
  overallProgress,
  context,
}: {
  overallProgress: { current: number; total: number };
  context?: string;
}) {
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
