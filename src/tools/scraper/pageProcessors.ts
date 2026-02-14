// download is handled by `imagePipeline` now
import { JobCancelled } from "@/lib/common/errors";
import type { StorageHelper } from "@/lib/common/scraperHelpers";
import { normalizeImageUrl } from "./imageHelpers";
import { processAndUploadImage } from "./imagePipeline";

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
  // uploadWithRetry is handled by the storage helper; callers no longer need to
  // provide it explicitly.
  // Optional cooperative cancellation callback. If it returns true, processing
  // should stop promptly by throwing an error.
  shouldCancel?: () => boolean;
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

    shouldCancel,
  } = options;

  let processed = 0;
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const img of supportedImages) {
    if (shouldCancel && shouldCancel()) {
      logProgress("⏹️", "Cancellation requested - stopping image processing");
      try {
        // Emit a clear cancellation log with context so we can correlate
        // the stack and job lifecycle in logs when diagnosing cancellation
        console.log(
          `[${new Date().toISOString()}] Cancellation detected in processImagesForPage for page=${link}`,
        );
      } catch {
        // best-effort logging only
      }
      throw new JobCancelled();
    }
    overallProgress.current++;

    if (img.src && img.src.startsWith("http")) {
      // Normalize the image URL for comparison (strip querystring/params)
      const normalizedSrc = normalizeImageUrl(img.src);

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

      const downloadUrl = img.originalSrc || img.src;
      const result = await processAndUploadImage({
        storage,
        downloadUrl,
        link,
        logProgress,
        pendingImageRecords,
        allExistingImageUrls,
        shouldCancel,
      });

      if (result.uploaded) {
        uploaded++;
      } else {
        failed++;
        console.error(
          `❌ Failed to process image ${img.src.split("/").pop()}: ${result.error}`,
        );
      }
    } else {
      console.error(`❌ Invalid image source: ${img.src}`);
      failed++;
    }
  }

  return { processed, uploaded, skipped, failed };
}
