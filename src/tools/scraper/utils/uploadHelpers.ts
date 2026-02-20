import type { StorageHelper } from "@/utils/common/scraperHelpers";
import {
  IMAGE_BUCKET,
  IMAGE_UPLOAD_RETRIES,
  IMAGE_UPLOAD_BACKOFF_FACTOR,
  IMAGE_UPLOAD_MIN_DELAY_MS,
} from "@/utils/config";
import { ensureBucket, uploadWithFallback } from "./storageHelper";
import { retryWithBackoff } from "./retryHelpers";
import { isRecord, getProp } from "@/utils/common/typeGuards";

export type LogProgressFn = (icon: string, message: string) => void;

export type UploadBufferResult = { path?: string; error?: unknown };

export async function uploadBufferToStorage({
  storage,
  filename,
  fileBuffer,
}: {
  storage: StorageHelper;
  filename: string;
  fileBuffer: Buffer;
}): Promise<UploadBufferResult> {
  await ensureBucket({ storage, bucket: IMAGE_BUCKET });

  const res = await retryWithBackoff(
    async () => {
      const r = await uploadWithFallback({
        storage,
        filename,
        file: fileBuffer,
        contentType: "image/webp",
      });
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
  if (isRecord(res) && isRecord(getProp(res, "data"))) {
    const data = getProp(res, "data");
    const path = getProp(data, "path");
    if (typeof path === "string") return { path };
    return { error: getProp(res, "error") ?? "upload_failed" };
  }
  return { error: getProp(res, "error") ?? "upload_failed" };
}
