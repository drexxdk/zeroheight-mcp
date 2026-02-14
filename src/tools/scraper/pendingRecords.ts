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
  pendingImageRecords.push({
    pageUrl,
    original_url: normalizeImageUrl(downloadUrl),
    storage_path: storagePath,
  });
  allExistingImageUrls.add(normalizeImageUrl(downloadUrl));
}
