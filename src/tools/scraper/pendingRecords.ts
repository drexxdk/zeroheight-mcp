import { normalizeImageUrl } from "./imageHelpers";

export type PendingImageRecord = {
  pageUrl: string;
  original_url: string;
  storage_path: string;
};

export function addPendingImageRecord(
  pendingImageRecords: PendingImageRecord[],
  pageUrl: string,
  downloadUrl: string,
  storagePath: string,
  allExistingImageUrls: Set<string>,
) {
  const normalized = normalizeImageUrl(downloadUrl);
  pendingImageRecords.push({
    pageUrl,
    original_url: normalized,
    storage_path: storagePath,
  });
  allExistingImageUrls.add(normalized);
  if (process.env.SCRAPER_DEBUG) {
    console.log(
      `[scraper] addPendingImageRecord page=${pageUrl} download=${downloadUrl} normalized=${normalized} storage=${storagePath}`,
    );
  }
}
