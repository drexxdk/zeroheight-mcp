import { downloadImage } from "../../image-utils";
import type { StorageHelper } from "../../common/scraperHelpers";
import { IMAGE_BUCKET } from "../../config";
import { hashFilenameFromUrl, normalizeImageUrl } from "./imageHelpers";
import { ensureBucket, uploadWithFallback } from "./storageHelper";
import { JobCancelled } from "../../common/errors";

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

  try {
    if (shouldCancel && shouldCancel()) {
      logProgress("⏹️", "Cancellation requested - aborting image download");
      throw new JobCancelled();
    }

    const file = await downloadImageToBuffer(downloadUrl, filename);
    if (!file) return { uploaded: false, error: "download_failed" };

    if (shouldCancel && shouldCancel()) {
      logProgress("⏹️", "Cancellation requested - aborting before upload");
      throw new JobCancelled();
    }

    await ensureBucket(storage, IMAGE_BUCKET);

    if (shouldCancel && shouldCancel()) {
      logProgress(
        "⏹️",
        "Cancellation requested - aborting before upload attempt",
      );
      throw new JobCancelled();
    }

    const res = await uploadWithFallback(storage, filename, file, "image/jpeg");
    if (res.error) {
      return {
        uploaded: false,
        error: String(res.error.message || "upload_failed"),
      };
    }
    const path = res.data?.path;
    if (!path) return { uploaded: false, error: "no_path_returned" };

    pendingImageRecords.push({
      pageUrl: link,
      original_url: downloadUrl,
      storage_path: path,
    });
    allExistingImageUrls.add(normalizeImageUrl(downloadUrl));
    logProgress(
      "✅",
      `Successfully uploaded image: ${downloadUrl.split("/").pop()}`,
    );
    return { uploaded: true, path };
  } catch (e) {
    return {
      uploaded: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
