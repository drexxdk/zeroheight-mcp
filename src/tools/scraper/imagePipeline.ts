import { downloadImage } from "@/lib/image-utils";
import type { StorageHelper } from "@/lib/common/scraperHelpers";
import { hashFilenameFromUrl, normalizeImageUrl } from "./imageHelpers";
import { uploadBufferToStorage } from "./uploadHelpers";
import { addPendingImageRecord } from "./pendingRecords";
import { retryWithBackoff } from "./retryHelpers";
import { JobCancelled } from "@/lib/common/errors";

export type LogProgressFn = (icon: string, message: string) => void;

export async function downloadImageToBuffer(
  downloadUrl: string,
  filename: string,
): Promise<Buffer | null> {
  const base64 = await downloadImage(downloadUrl, filename);
  if (!base64) return null;
  return Buffer.from(base64, "base64");
}

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
}): Promise<{ uploaded: boolean; path?: string; error?: string }> {
  const {
    storage,
    downloadUrl,
    link,
    logProgress,
    pendingImageRecords,
    allExistingImageUrls,
    shouldCancel,
  } = options;
  const filename = options.filename ?? hashFilenameFromUrl(downloadUrl, "jpg");
  const sanitizedUrl = normalizeImageUrl(downloadUrl);

  try {
    if (shouldCancel && shouldCancel()) {
      logProgress("⏹️", "Cancellation requested - aborting image download");
      throw new JobCancelled();
    }

    const file = await retryWithBackoff(
      () => downloadImageToBuffer(downloadUrl, filename),
      {
        retries: 3,
        factor: 2,
        minDelayMs: 250,
      },
    );
    if (!file) return { uploaded: false, error: "download_failed" };

    if (shouldCancel && shouldCancel()) {
      logProgress("⏹️", "Cancellation requested - aborting before upload");
      throw new JobCancelled();
    }

    const uploadRes = await uploadBufferToStorage(storage, filename, file);
    if (uploadRes.error) {
      const e = uploadRes.error;
      const msg = e instanceof Error ? e.message : String(e);
      return { uploaded: false, error: msg || "upload_failed" };
    }
    const path = uploadRes.path;
    if (!path) return { uploaded: false, error: "no_path_returned" };

    addPendingImageRecord(
      pendingImageRecords,
      link,
      sanitizedUrl,
      path,
      allExistingImageUrls,
    );
    const visibleName =
      sanitizedUrl.split("/").filter(Boolean).pop() ?? filename;
    logProgress("✅", `Successfully uploaded image: ${visibleName}`);
    return { uploaded: true, path };
  } catch (e) {
    return {
      uploaded: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
