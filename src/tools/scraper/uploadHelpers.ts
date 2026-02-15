import type { StorageHelper } from "@/lib/common/scraperHelpers";
import {
  IMAGE_BUCKET,
  IMAGE_UPLOAD_RETRIES,
  IMAGE_UPLOAD_BACKOFF_FACTOR,
  IMAGE_UPLOAD_MIN_DELAY_MS,
} from "@/lib/config";
import { ensureBucket, uploadWithFallback } from "./storageHelper";
import { retryWithBackoff } from "./retryHelpers";

export type LogProgressFn = (icon: string, message: string) => void;

export async function uploadBufferToStorage(
  storage: StorageHelper,
  filename: string,
  fileBuffer: Buffer,
): Promise<{ path?: string; error?: unknown }> {
  await ensureBucket(storage, IMAGE_BUCKET);

  const res = await retryWithBackoff(
    async () => {
      const r = await uploadWithFallback(
        storage,
        filename,
        fileBuffer,
        "image/jpeg",
      );
      if (r.error) throw r.error;
      return r;
    },
    {
      retries: IMAGE_UPLOAD_RETRIES,
      factor: IMAGE_UPLOAD_BACKOFF_FACTOR,
      minDelayMs: IMAGE_UPLOAD_MIN_DELAY_MS,
    },
  );

  if (!res) return { error: "upload_failed" };
  return { path: res.data?.path };
}
