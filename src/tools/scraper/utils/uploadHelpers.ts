import type { StorageHelper } from "@/utils/common/scraperHelpers";
import { config } from "@/utils/config";
import { ensureBucket, uploadWithFallback } from "./storageHelper";
import { retryWithBackoff } from "./retryHelpers";
// no-op

export type LogProgressFn = (icon: string, message: string) => void;

export type UploadBufferResult = { path?: string; error?: string };

export async function uploadBufferToStorage({
  storage,
  filename,
  fileBuffer,
}: {
  storage: StorageHelper;
  filename: string;
  fileBuffer: Buffer;
}): Promise<UploadBufferResult> {
  await ensureBucket({ storage, bucket: config.storage.imageBucket });

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
      retries: config.image.upload.retries,
      factor: config.image.upload.backoffFactor,
      minDelayMs: config.image.upload.minDelayMs,
    },
  );

  if (!res) return { error: "upload_failed" };
  if (res.data && typeof res.data.path === "string")
    return { path: res.data.path };
  return { error: String(res.error?.message ?? "upload_failed") };
}
