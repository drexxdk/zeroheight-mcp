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
}) {
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

  for (const img of supportedImages) {
    overallProgress.current++;

    if (img.src && img.src.startsWith("http")) {
      if (allExistingImageUrls.has(img.src)) {
        logProgress("🚫", "Skipping image - already processed");
        continue;
      }

      overallProgress.imagesProcessed++;
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
          } else if (data && data.path) {
            const storagePath = data.path;
            pendingImageRecords.push({
              pageUrl: link,
              original_url: downloadUrl,
              storage_path: storagePath,
            });
            allExistingImageUrls.add(img.src);
            logProgress(
              "✅",
              `Successfully uploaded image: ${img.src.split("/").pop()}`,
            );
          } else {
            console.error(
              `❌ Upload returned no path for image ${img.src.split("/").pop()}`,
            );
          }
        } else {
          console.error(
            `❌ Failed to download image: ${img.src.split("/").pop()}`,
          );
        }
      } catch (e) {
        console.error(
          `❌ Error processing image ${img.src.split("/").pop()}:`,
          e instanceof Error ? e.message : String(e),
        );
      }
    } else {
      console.error(`❌ Invalid image source: ${img.src}`);
    }
  }
}
