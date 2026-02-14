import type {
  StorageHelper,
  StorageUploadResult,
} from "../../common/scraperHelpers";
import { uploadWithRetry } from "../../common/scraperHelpers";
import { IMAGE_BUCKET, ALLOWED_MIME_TYPES } from "../../config";
import { uploadViaServer } from "./imageHelpers";

export async function ensureBucket(
  storage: StorageHelper,
  bucket = IMAGE_BUCKET,
): Promise<void> {
  if (!storage.listBuckets) return;
  try {
    const { data: buckets, error: bucketError } = await storage.listBuckets();
    if (bucketError) {
      console.error("Error listing buckets:", bucketError);
      return;
    }
    const bucketExists = buckets?.some(
      (b: { name: string }) => b.name === bucket,
    );
    if (!bucketExists && storage.createBucket) {
      const { error: createError } = await storage.createBucket(bucket, {
        public: true,
        allowedMimeTypes: ALLOWED_MIME_TYPES,
        fileSizeLimit: 10485760,
      });
      if (createError) console.error("Error creating bucket:", createError);
    }
  } catch (e) {
    console.error("ensureBucket exception:", e);
  }
}

export async function uploadWithFallback(
  storage: StorageHelper,
  filename: string,
  file: Buffer,
  contentType = "application/octet-stream",
): Promise<StorageUploadResult> {
  const result = await uploadWithRetry(storage, filename, file);
  if (
    result.error &&
    /row-level security|violates row-level security|permission/i.test(
      String(result.error.message || ""),
    )
  ) {
    try {
      const base64 = file.toString("base64");
      const path = await uploadViaServer(
        IMAGE_BUCKET,
        filename,
        base64,
        contentType,
      );
      return { data: { path } };
    } catch (e) {
      return { error: { message: String(e) } };
    }
  }
  return result;
}
