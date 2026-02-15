// download is handled by `imagePipeline` now
import { JobCancelled } from "@/lib/common/errors";
import type { StorageHelper } from "@/lib/common/scraperHelpers";
import { normalizeImageUrl } from "./imageHelpers";
import { processAndUploadImage } from "./imagePipeline";
import { mapWithConcurrency } from "./concurrency";

export type Progress = {
  current: number;
  total: number;
  pagesProcessed: number;
  imagesProcessed: number;
};

export type LogProgressFn = (icon: string, message: string) => void;

// Module-level set to prevent duplicate uploads across concurrent page workers.
const GLOBAL_IN_PROGRESS = new Set<string>();

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

  const concurrency = Number(process.env.SCRAPER_IMAGE_CONCURRENCY || 4);
  // Use module-level set so multiple concurrent page-processing tasks in the
  // same Node process coordinate and avoid duplicate uploads for the same
  // normalized URL.
  const inProgress = GLOBAL_IN_PROGRESS;

  const results = await mapWithConcurrency(
    supportedImages,
    async (img) => {
      if (shouldCancel && shouldCancel()) {
        logProgress("⏹️", "Cancellation requested - stopping image processing");
        try {
          console.log(
            `[${new Date().toISOString()}] Cancellation detected in processImagesForPage for page=${link}`,
          );
        } catch {
          // best-effort
        }
        throw new JobCancelled();
      }
      overallProgress.current++;

      if (!(img.src && img.src.startsWith("http"))) {
        console.error(`❌ Invalid image source: ${img.src}`);
        return { processed: 0, uploaded: 0, skipped: 0, failed: 1 };
      }

      const normalizedSrc = normalizeImageUrl(img.src);
      if (allExistingImageUrls.has(normalizedSrc)) {
        logProgress("🚫", "Skipping image - already processed");
        return { processed: 0, uploaded: 0, skipped: 1, failed: 0 };
      }
      // Avoid race where multiple concurrent tasks both see the URL as not
      // existing and start uploads. If another task is already processing the
      // same normalized URL, treat this one as skipped to avoid duplicate
      // uploads.
      if (inProgress.has(normalizedSrc)) {
        logProgress("⏭️", "Skipping duplicate image in-progress");
        return { processed: 0, uploaded: 0, skipped: 1, failed: 0 };
      }
      inProgress.add(normalizedSrc);

      overallProgress.imagesProcessed++;
      logProgress(
        "📷",
        `Processing image ${overallProgress.imagesProcessed}: ${img.src.split("/").pop()}`,
      );

      const downloadUrl = img.originalSrc || img.src;
      let result;
      try {
        result = await processAndUploadImage({
          storage,
          downloadUrl,
          link,
          logProgress,
          pendingImageRecords,
          allExistingImageUrls,
          shouldCancel,
        });
      } finally {
        // Ensure we release the in-progress lock so other occurrences can be
        // considered (they will now see the URL in `allExistingImageUrls`).
        inProgress.delete(normalizedSrc);
      }
      if (result && result.uploaded)
        return { processed: 1, uploaded: 1, skipped: 0, failed: 0 };
      console.error(
        `❌ Failed to process image ${img.src.split("/").pop()}: ${result.error}`,
      );
      return { processed: 1, uploaded: 0, skipped: 0, failed: 1 };
    },
    concurrency,
  );

  const totals = results.reduce(
    (acc, r) => {
      acc.processed += r.processed;
      acc.uploaded += r.uploaded;
      acc.skipped += r.skipped;
      acc.failed += r.failed;
      return acc;
    },
    { processed: 0, uploaded: 0, skipped: 0, failed: 0 },
  );

  return totals;
}
