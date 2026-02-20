import type {
  StorageHelper,
  StorageUploadResult,
} from "@/utils/common/scraperHelpers";
import { uploadWithRetry } from "@/utils/common/scraperHelpers";
import { config } from "@/utils/config";
import { getSupabaseAdminClient } from "@/utils/common";

export async function ensureBucket({
  storage,
  bucket = config.storage.imageBucket,
}: {
  storage: StorageHelper;
  bucket?: string;
}): Promise<void> {
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
        allowedMimeTypes: config.image.allowedMimeTypes,
        fileSizeLimit: config.storage.fileSizeLimitBytes,
      });
      if (createError) console.error("Error creating bucket:", createError);
    }
  } catch (e) {
    console.error("ensureBucket exception:", e);
  }
}

export async function uploadWithFallback({
  storage,
  filename,
  file,
  contentType = "application/octet-stream",
}: {
  storage: StorageHelper;
  filename: string;
  file: Buffer;
  contentType?: string;
}): Promise<StorageUploadResult> {
  const result = await uploadWithRetry({ storage, filename, file });
  if (
    result.error &&
    /row-level security|violates row-level security|permission/i.test(
      String(result.error.message || ""),
    )
  ) {
    try {
      // Attempt to use the Supabase admin client to perform the upload as
      // a fallback when the runtime client lacks permission (RLS).
      const admin = getSupabaseAdminClient();
      if (!admin) throw new Error("Supabase admin client not configured");
      const base64 = file.toString("base64");
      const buffer = Buffer.from(base64, "base64");
      const { error: upErr } = await admin.storage
        .from(config.storage.imageBucket)
        .upload(filename, buffer, {
          cacheControl: `${config.storage.storageCacheControlSec}`,
          upsert: true,
          contentType,
        });
      if (upErr) throw upErr;
      const path = `${filename}`;
      return { data: { path } };
    } catch (e) {
      return { error: { message: String(e) } };
    }
  }
  return result;
}
