import { normalizeImageUrl } from "./imageHelpers";

export type PendingImageRecord = {
  pageUrl: string;
  original_url: string;
  storage_path: string;
};

import { SCRAPER_DEBUG } from "@/utils/config";

export function addPendingImageRecord({
  pendingImageRecords,
  pageUrl,
  downloadUrl,
  storagePath,
  allExistingImageUrls,
}: {
  pendingImageRecords: PendingImageRecord[];
  pageUrl: string;
  downloadUrl: string;
  storagePath: string;
  allExistingImageUrls: Set<string>;
}): void {
  const normalized = normalizeImageUrl({ src: downloadUrl });
  pendingImageRecords.push({
    pageUrl,
    original_url: normalized,
    storage_path: storagePath,
  });
  allExistingImageUrls.add(normalized);
  if (SCRAPER_DEBUG) {
    console.log(
      `[debug] addPendingImageRecord page=${pageUrl} download=${downloadUrl} normalized=${normalized} storage=${storagePath}`,
    );
  }
}
