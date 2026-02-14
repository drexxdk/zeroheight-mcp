import { downloadImage } from "../../image-utils";
import { IMAGE_BUCKET, ALLOWED_MIME_TYPES } from "../../config";
import type {
  StorageHelper,
  StorageUploadResult,
} from "../../common/scraperHelpers";

export type Progress = {
  current: number;
  total: number;
  pagesProcessed: number;
  imagesProcessed: number;
};

export type LogProgressFn = (icon: string, message: string) => void;

export async function processImagesForPage(options: {
  supportedImages: Array<{ src: string; alt: string; originalSrc?: string }>;
  link: string;
  storage: StorageHelper;
  overallProgress: Progress;
  allExistingImageUrls: Set<string>;
  pendingImageRecords: Array<{
    pageUrl: string;
    original_url: string;
    storage_path: string;
  }>;
  logProgress: LogProgressFn;
  uploadWithRetry: (
    storage: StorageHelper,
    filename: string,
    file: Buffer,
  ) => Promise<StorageUploadResult>;
}): Promise<{
  processed: number;
  uploaded: number;
  skipped: number;
  failed: number;
}> {
  const {
    supportedImages,
    link,
    storage,
    overallProgress,
    allExistingImageUrls,
    pendingImageRecords,
    logProgress,
    uploadWithRetry,
  } = options;

  let processed = 0;
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const img of supportedImages) {
    overallProgress.current++;

    if (img.src && img.src.startsWith("http")) {
      // Normalize the image URL for comparison (strip querystring/params)
      let normalizedSrc = img.src;
      try {
        const u = new URL(img.src);
        normalizedSrc = `${u.protocol}//${u.hostname}${u.pathname}`;
      } catch {
        // leave as-is if parsing fails
      }

      if (allExistingImageUrls.has(normalizedSrc)) {
        logProgress("🚫", "Skipping image - already processed");
        skipped++;
        continue;
      }

      overallProgress.imagesProcessed++;
      processed++;
      logProgress(
        "📷",
        `Processing image ${overallProgress.imagesProcessed}: ${img.src.split("/").pop()}`,
      );

      const crypto = await import("crypto");
      const urlHash = crypto.default
        .createHash("md5")
        .update(img.src)
        .digest("hex")
        .substring(0, 8);
      const filename = `${urlHash}.jpg`;

      const downloadUrl = img.originalSrc || img.src;

      try {
        const base64Data = await downloadImage(downloadUrl, filename);
        if (base64Data) {
          const file = Buffer.from(base64Data, "base64");

          if (storage.listBuckets) {
            const { data: buckets, error: bucketError } =
              await storage.listBuckets();
            if (bucketError) {
              console.error("Error listing buckets:", bucketError);
            } else {
              const bucketExists = buckets?.some(
                (b: { name: string }) => b.name === IMAGE_BUCKET,
              );
              if (!bucketExists && storage.createBucket) {
                const { error: createError } = await storage.createBucket(
                  IMAGE_BUCKET,
                  {
                    public: true,
                    allowedMimeTypes: ALLOWED_MIME_TYPES,
                    fileSizeLimit: 10485760,
                  },
                );
                if (createError)
                  console.error("Error creating bucket:", createError);
              }
            }
          }

          const uploadResult: StorageUploadResult = await uploadWithRetry(
            storage,
            filename,
            file,
          );
          const { data, error } = uploadResult;

          if (error) {
            console.error(
              `❌ Failed to upload image ${img.src.split("/").pop()}:`,
              error.message,
            );
            failed++;
          } else if (data && data.path) {
            const storagePath = data.path;
            pendingImageRecords.push({
              pageUrl: link,
              original_url: downloadUrl,
              storage_path: storagePath,
            });
            // Add normalized URL to existing set to match DB normalization logic
            let normalizedDownload = downloadUrl;
            try {
              const u2 = new URL(downloadUrl);
              normalizedDownload = `${u2.protocol}//${u2.hostname}${u2.pathname}`;
            } catch {
              // leave as-is
            }
            allExistingImageUrls.add(normalizedDownload);
            uploaded++;
            logProgress(
              "✅",
              `Successfully uploaded image: ${img.src.split("/").pop()}`,
            );
          } else {
            console.error(
              `❌ Upload returned no path for image ${img.src.split("/").pop()}`,
            );
            failed++;
          }
        } else {
          console.error(
            `❌ Failed to download image: ${img.src.split("/").pop()}`,
          );
          failed++;
        }
      } catch (e) {
        console.error(
          `❌ Error processing image ${img.src.split("/").pop()}:`,
          e instanceof Error ? e.message : String(e),
        );
        failed++;
      }
    } else {
      console.error(`❌ Invalid image source: ${img.src}`);
      failed++;
    }
  }

  return { processed, uploaded, skipped, failed };
}
