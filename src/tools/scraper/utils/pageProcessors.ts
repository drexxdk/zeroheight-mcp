// download is handled by `imagePipeline` now
import { JobCancelled } from "@/utils/common/errors";
import type { StorageHelper } from "@/utils/common/scraperHelpers";
import { normalizeImageUrl } from "./imageHelpers";
import { processAndUploadImage } from "./imagePipeline";
import type { ProcessAndUploadResult } from "./imagePipeline";
import { mapWithConcurrency } from "./concurrency";
import { config } from "@/utils/config";
import logger from "@/utils/logger";
import {
  getProgressSnapshot,
  upsertItem,
  markImageUploaded,
  markImageAlreadyPresent,
  markImageDuplicate,
  markImageInvalid,
  markImageFailed,
} from "@/utils/common/progress";
import { formatPathForConsole } from "./scrapeHelpers";

export type LogProgressFn = (icon: string, message: string) => void;

// Module-level set to prevent duplicate uploads across concurrent page workers.
const GLOBAL_IN_PROGRESS = new Set<string>();

// Global semaphore to limit concurrent image uploads across all page workers.
// This prevents unbounded parallel uploads when many pages run concurrently.
const cfg = config.scraper as {
  imageConcurrency: number;
  imageConcurrencyTotal?: number;
};
const GLOBAL_UPLOAD_LIMIT = cfg.imageConcurrencyTotal ?? cfg.imageConcurrency;
let GLOBAL_UPLOAD_CURRENT = 0;
const acquireGlobalUpload = async (): Promise<void> => {
  // simple spin-wait with small delay
  while (GLOBAL_UPLOAD_CURRENT >= GLOBAL_UPLOAD_LIMIT) {
    await new Promise((r) => setTimeout(r, 50));
  }
  GLOBAL_UPLOAD_CURRENT += 1;
};
const releaseGlobalUpload = (): void => {
  GLOBAL_UPLOAD_CURRENT = Math.max(0, GLOBAL_UPLOAD_CURRENT - 1);
};

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
  logProgress(
    "🐛",
    `Starting image processing for page ${link} with ${supportedImages.length} images`,
  );
  const results = await mapWithConcurrency(
    supportedImages,
    (img) =>
      processSingleImage(img, {
        shouldCancel,
        inProgress,
        storage,
        link,
        logProgress,
        pendingImageRecords,
        allExistingImageUrls,
      }),
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

async function processSingleImage(
  img: { src: string; alt: string; originalSrc?: string },
  ctx: {
    shouldCancel?: () => boolean;
    inProgress: Set<string>;
    storage: StorageHelper;
    link: string;
    logProgress: LogProgressFn;
    pendingImageRecords: Array<{
      pageUrl: string;
      original_url: string;
      storage_path: string;
    }>;
    allExistingImageUrls: Set<string>;
  },
): Promise<ProcessImagesResult> {
  const {
    shouldCancel,
    storage,
    link,
    logProgress,
    pendingImageRecords,
    allExistingImageUrls,
  } = ctx;

  const prep = prepareImageProcessing(img, ctx);
  if (prep.early) return prep.early;

  const { normalizedSrc, downloadUrl } = prep;

  logProgress("📷", `Processing image: ${String(img.src).split("/").pop()}`);

  const result = await doUpload(downloadUrl!, {
    storage,
    link,
    logProgress,
    pendingImageRecords,
    allExistingImageUrls,
    shouldCancel,
  });

  finalizeResult(result, normalizedSrc!);
  if (result && result.uploaded)
    return { processed: 1, uploaded: 1, skipped: 0, failed: 0 };
  logProgress(
    "❌",
    `Failed to process image ${String(img.src).split("/").pop()}: ${result?.error ?? "unknown"}`,
  );
  return { processed: 1, uploaded: 0, skipped: 0, failed: 1 };
}

function prepareImageProcessing(
  img: { src: string; alt: string; originalSrc?: string },
  ctx: {
    shouldCancel?: () => boolean;
    inProgress: Set<string>;
    storage: StorageHelper;
    link: string;
    logProgress: LogProgressFn;
    pendingImageRecords: Array<{
      pageUrl: string;
      original_url: string;
      storage_path: string;
    }>;
    allExistingImageUrls: Set<string>;
  },
): {
  early?: ProcessImagesResult;
  normalizedSrc?: string;
  downloadUrl?: string;
} {
  const { shouldCancel, inProgress, logProgress, allExistingImageUrls } = ctx;
  if (shouldCancel && shouldCancel()) {
    // will throw
    handleCancellation(ctx.link, logProgress);
  }

  const imageKey = buildImageKey(img.src);
  markStartedSafe(imageKey);

  if (!isValidHttpSrc(img.src))
    return { early: handleInvalidSource(img.src, logProgress) };

  const normalizedSrc = normalizeImageUrl({ src: img.src });
  const already = handleExisting(
    normalizedSrc,
    allExistingImageUrls,
    logProgress,
  );
  if (already) return { early: already };

  if (inProgress.has(normalizedSrc))
    return { early: handleDuplicate(normalizedSrc, logProgress) };
  inProgress.add(normalizedSrc);

  const downloadUrl = img.originalSrc || img.src;
  return { normalizedSrc, downloadUrl };
}

function handleCancellation(link: string, logProgress: LogProgressFn): never {
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

function buildImageKey(src?: string): string {
  try {
    return normalizeImageUrl({ src: String(src || "") });
  } catch {
    return String(src || "");
  }
}

function markStartedSafe(imageKey: string): void {
  try {
    upsertItem({ url: imageKey, type: "image", status: "started" });
    try {
      const s = getProgressSnapshot();
      if (s.current > s.total)
        logger.warn(
          `⚠️ Progress invariant violated: current (${s.current}) > total (${s.total})`,
        );
      if (s.current < 0)
        logger.warn(
          `⚠️ Progress invariant violated: current is negative (${s.current})`,
        );
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }
}

function isValidHttpSrc(src?: string): boolean {
  return Boolean(src && src.startsWith("http"));
}

function handleInvalidSource(
  src: string | undefined,
  logProgress: LogProgressFn,
): ProcessImagesResult {
  logProgress("❌", `Invalid image source: ${String(src).split("/").pop()}`);
  try {
    const key = normalizeImageUrl
      ? normalizeImageUrl({ src: String(src || "") })
      : String(src || "");
    markImageInvalid(key);
  } catch {
    try {
      markImageInvalid(String(src || ""));
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

function handleExisting(
  normalizedSrc: string,
  allExistingImageUrls: Set<string>,
  logProgress: LogProgressFn,
): ProcessImagesResult | null {
  if (allExistingImageUrls.has(normalizedSrc)) {
    logProgress("🚫", "Skipping image - already processed");
    try {
      markImageAlreadyPresent(normalizedSrc);
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
  return null;
}

function handleDuplicate(
  normalizedSrc: string,
  logProgress: LogProgressFn,
): ProcessImagesResult {
  logProgress("⏭️", "Skipping duplicate image in-progress");
  try {
    markImageDuplicate(normalizedSrc);
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

async function doUpload(
  downloadUrl: string,
  ctx: {
    storage: StorageHelper;
    link: string;
    logProgress: LogProgressFn;
    pendingImageRecords: Array<{
      pageUrl: string;
      original_url: string;
      storage_path: string;
    }>;
    allExistingImageUrls: Set<string>;
    shouldCancel?: () => boolean;
  },
): Promise<ProcessAndUploadResult | undefined> {
  const {
    storage,
    link,
    logProgress,
    pendingImageRecords,
    allExistingImageUrls,
    shouldCancel,
  } = ctx;
  let result: ProcessAndUploadResult | undefined;
  try {
    await acquireGlobalUpload();
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
      logProgress(
        "🐛",
        `processAndUploadImage result for ${downloadUrl}: ${JSON.stringify(result)}`,
      );
    } finally {
      releaseGlobalUpload();
    }
  } finally {
    // noop here; caller will finalize
  }
  return result;
}

function finalizeResult(
  result: ProcessAndUploadResult | undefined,
  normalizedSrc: string,
): void {
  try {
    const keyToMark =
      result && result.normalizedUrl ? result.normalizedUrl : normalizedSrc;
    if (result && result.uploaded) markImageUploaded(keyToMark);
    else if (result && result.error)
      markImageFailed(keyToMark, String(result.error));
    else markImageFailed(keyToMark);
  } catch {
    // best-effort
  }
}
