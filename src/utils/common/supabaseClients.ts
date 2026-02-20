import { getSupabaseClient, getSupabaseAdminClient } from "../common";
import { isRecord, getProp } from "@/utils/common/typeGuards";
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
        contentType: "image/webp",
      });
    },
    // list/create buckets are only available with admin privileges
    listBuckets: admin
      ? async () => {
          const res = await admin.storage.listBuckets();
          if (isRecord(res)) {
            const data = getProp(res, "data");
            const errorRaw = getProp(res, "error");
            const dataOut = Array.isArray(data)
              ? data
                  .filter(
                    (it: unknown): it is Record<string, unknown> =>
                      isRecord(it) && typeof getProp(it, "name") === "string",
                  )
                  .map((it) => ({ name: String(getProp(it, "name")) }))
              : null;
            const errorOut =
              isRecord(errorRaw) &&
              typeof getProp(errorRaw, "message") === "string"
                ? { message: String(getProp(errorRaw, "message")) }
                : errorRaw
                  ? { message: String(errorRaw) }
                  : null;
            return { data: dataOut, error: errorOut };
          }
          return { data: null, error: { message: String(res) } };
        }
      : undefined,
    // createBucket uses admin-only storage API. The runtime shape of `opts`
    // is compatible with the client but the exact param type depends on
    // the Supabase client types; cast with a narrow, documented shape and
    // use an eslint exception for the explicit any used in the call.
    createBucket: admin
      ? async (
          name: string,
          opts?: {
            public?: boolean;
            allowedMimeTypes?: string[] | null;
            fileSizeLimit?: number | null;
          },
        ) => {
          // Access the runtime `createBucket` function safely and call it.
          const maybeStorage = admin.storage;
          if (
            isRecord(maybeStorage) &&
            typeof maybeStorage["createBucket"] === "function"
          ) {
            const maybeCreate = getProp(maybeStorage, "createBucket");
            let res: unknown;
            if (typeof maybeCreate === "function") {
              // Call the runtime function; narrow the call site with a typed invocation
              // (we avoid assuming the exact client signature at compile time)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              res = await (maybeCreate as (...a: any[]) => Promise<unknown>)(
                name,
                opts,
              );
            } else {
              return {
                data: undefined,
                error: { message: "createBucket not available" },
              };
            }
            if (isRecord(res)) {
              const dataRaw = getProp(res, "data");
              const errorRaw = getProp(res, "error");
              const dataOut =
                isRecord(dataRaw) &&
                typeof getProp(dataRaw, "name") === "string"
                  ? { name: String(getProp(dataRaw, "name")) }
                  : null;
              const errorOut =
                isRecord(errorRaw) &&
                typeof getProp(errorRaw, "message") === "string"
                  ? { message: String(getProp(errorRaw, "message")) }
                  : errorRaw
                    ? { message: String(errorRaw) }
                    : null;
              return { data: dataOut, error: errorOut };
            }
            return { data: undefined, error: { message: String(res) } };
          }
          return {
            data: undefined,
            error: { message: "createBucket not available" },
          };
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
