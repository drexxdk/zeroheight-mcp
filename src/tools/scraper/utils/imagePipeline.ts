import type { StorageHelper } from "@/utils/common/scraperHelpers";
import { hashFilenameFromUrl, normalizeImageUrl } from "./imageHelpers";
import { addPendingImageRecord } from "./pendingRecords";
import { SCRAPER_DEBUG } from "@/utils/config";
import { JobCancelled } from "@/utils/common/errors";

export type LogProgressFn = (icon: string, message: string) => void;

export async function processAndUploadImage(options: {
  storage: StorageHelper;
  downloadUrl: string;
  link: string;
  logProgress: LogProgressFn;
  pendingImageRecords: Array<{
    pageUrl: string;
    original_url: string;
    storage_path: string;
  }>;
  allExistingImageUrls: Set<string>;
  // Optional cooperative cancellation callback
  shouldCancel?: () => boolean;
  filename?: string;
}): Promise<{
  uploaded: boolean;
  recorded?: boolean;
  path?: string;
  error?: string;
}> {
  const {
    downloadUrl,
    link,
    logProgress,
    pendingImageRecords,
    allExistingImageUrls,
    shouldCancel,
  } = options;

  const filename =
    options.filename ?? hashFilenameFromUrl({ url: downloadUrl, ext: "jpg" });
  const sanitizedUrl = normalizeImageUrl({ src: downloadUrl });

  try {
    if (shouldCancel && shouldCancel()) {
      logProgress("⏹️", "Cancellation requested - skipping image record");
      throw new JobCancelled();
    }

    // URL-only mode: do not download or upload images during scraping.
    // Record the normalized remote URL as the image `storagePath` so
    // downstream code (and Next.js) can fetch/resize on demand.
    const path = sanitizedUrl;
    if (SCRAPER_DEBUG)
      console.log(`[debug] recorded remote image URL: ${sanitizedUrl}`);

    addPendingImageRecord({
      pendingImageRecords,
      pageUrl: link,
      downloadUrl: sanitizedUrl,
      storagePath: path,
      allExistingImageUrls,
    });

    const visibleName =
      sanitizedUrl.split("/").filter(Boolean).pop() ?? filename;
    logProgress("✅", `Recorded remote image URL: ${visibleName}`);
    // Indicate this was recorded (URL-only) rather than uploaded to storage.
    return { uploaded: false, recorded: true, path } as unknown as {
      uploaded: boolean;
      path?: string;
      error?: string;
    };
  } catch (e) {
    return {
      uploaded: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
