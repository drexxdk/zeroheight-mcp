// download is handled by `imagePipeline` now
import { JobCancelled } from "@/utils/common/errors";
import type { StorageHelper } from "@/utils/common/scraperHelpers";
import { normalizeImageUrl } from "./imageHelpers";
import { processAndUploadImage } from "./imagePipeline";
import { mapWithConcurrency } from "./concurrency";
import { config } from "@/utils/config";
import logger from "@/utils/logger";
import { getProgressSnapshot, upsertItem } from "@/utils/common/progress";
import { formatPathForConsole } from "./scrapeHelpers";

export type LogProgressFn = (icon: string, message: string) => void;

// Module-level set to prevent duplicate uploads across concurrent page workers.
const GLOBAL_IN_PROGRESS = new Set<string>();

export type ProcessImagesResult = {
  processed: number;
  uploaded: number;
  skipped: number;
  failed: number;
};

export async function processImagesForPage(options: {
  supportedImages: Array<{ src: string; alt: string; originalSrc?: string }>;
  link: string;
  storage: StorageHelper;
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
}): Promise<ProcessImagesResult> {
  const {
    supportedImages,
    link,
    storage,
    allExistingImageUrls,
    pendingImageRecords,
    logProgress,
    shouldCancel,
  } = options;

  // Use singleton increment/incImages directly; replicate invariant checks locally

  const concurrency = config.scraper.imageConcurrency;
  // Use module-level set so multiple concurrent page-processing tasks in the
  // same Node process coordinate and avoid duplicate uploads for the same
  // normalized URL.
  const inProgress = GLOBAL_IN_PROGRESS;

  /* eslint-disable complexity */
  const results = await mapWithConcurrency(
    supportedImages,
    async (img) => {
      if (shouldCancel && shouldCancel()) {
        logProgress("⏹️", "Cancellation requested - stopping image processing");
        try {
          logProgress(
            "🕒",
            `Cancellation detected in processImagesForPage for page=${formatPathForConsole?.(link) ?? link}`,
          );
        } catch {
          // best-effort
        }
        throw new JobCancelled();
      }

      // Mark image processing as started so the overall `current` reflects
      // active work units immediately instead of waiting for completion.
      let imageKey = String(img.src || "");
      try {
        imageKey = normalizeImageUrl({ src: img.src });
      } catch {
        imageKey = String(img.src || "");
      }
      try {
        upsertItem({ url: imageKey, type: "image", status: "started" });
        try {
          const s = getProgressSnapshot();
          if (s.current > s.total) {
            logger.warn(
              `⚠️ Progress invariant violated: current (${s.current}) > total (${s.total})`,
            );
          }
          if (s.current < 0) {
            logger.warn(
              `⚠️ Progress invariant violated: current is negative (${s.current})`,
            );
          }
        } catch {
          // ignore
        }
      } catch {
        // ignore
      }

      if (!(img.src && img.src.startsWith("http"))) {
        logProgress("❌", `Invalid image source: ${img.src.split("/").pop()}`);
        // Count this image as processed (it consumed a reserved slot)
        // Delegate uniqueness/counting to the central ProgressService.
        try {
          const key = normalizeImageUrl
            ? normalizeImageUrl({ src: String(img.src || "") })
            : String(img.src || "");
          upsertItem({ url: key, type: "image", status: "processed" });
        } catch {
          try {
            upsertItem({
              url: String(img.src || ""),
              type: "image",
              status: "processed",
            });
          } catch {
            // best-effort
          }
        }
        try {
          const s = getProgressSnapshot();
          if (s.current > s.total)
            logger.warn(
              `⚠️ Progress invariant violated: current (${s.current}) > total (${s.total})`,
            );
        } catch {
          // ignore
        }
        return { processed: 0, uploaded: 0, skipped: 0, failed: 1 };
      }

      const normalizedSrc = normalizeImageUrl({ src: img.src });
      if (allExistingImageUrls.has(normalizedSrc)) {
        logProgress("🚫", "Skipping image - already processed");
        try {
          upsertItem({
            url: normalizedSrc,
            type: "image",
            status: "processed",
          });
        } catch {
          // best-effort
        }
        try {
          const s = getProgressSnapshot();
          if (s.current > s.total)
            logger.warn(
              `⚠️ Progress invariant violated: current (${s.current}) > total (${s.total})`,
            );
        } catch {
          // ignore
        }
        return { processed: 0, uploaded: 0, skipped: 1, failed: 0 };
      }
      // Avoid race where multiple concurrent tasks both see the URL as not
      // existing and start uploads. If another task is already processing the
      // same normalized URL, treat this one as skipped to avoid duplicate
      // uploads.
      if (inProgress.has(normalizedSrc)) {
        logProgress("⏭️", "Skipping duplicate image in-progress");
        try {
          upsertItem({
            url: normalizedSrc,
            type: "image",
            status: "processed",
          });
        } catch {
          // best-effort
        }
        try {
          const s = getProgressSnapshot();
          if (s.current > s.total)
            logger.warn(
              `⚠️ Progress invariant violated: current (${s.current}) > total (${s.total})`,
            );
        } catch {
          // ignore
        }
        return { processed: 0, uploaded: 0, skipped: 1, failed: 0 };
      }
      inProgress.add(normalizedSrc);

      logProgress("📷", `Processing image: ${img.src.split("/").pop()}`);

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
        // Count this image as completed (success, skip, or failure) — only
        // increment the global counter the first time we encounter this
        // normalized URL across the entire scraper run.
        try {
          upsertItem({
            url: normalizedSrc,
            type: "image",
            status: "processed",
          });
        } catch {
          // best-effort
        }
      }
      if (result && result.uploaded)
        return { processed: 1, uploaded: 1, skipped: 0, failed: 0 };
      logProgress(
        "❌",
        `Failed to process image ${img.src.split("/").pop()}: ${result?.error ?? "unknown"}`,
      );
      return { processed: 1, uploaded: 0, skipped: 0, failed: 1 };
    },
    concurrency,
  );
  /* eslint-enable complexity */

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
