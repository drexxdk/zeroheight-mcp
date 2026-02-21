import { normalizeImageUrl } from "./imageHelpers";

export type PendingImageRecord = {
  pageUrl: string;
  original_url: string;
  storage_path: string;
};

import { config } from "@/utils/config";
import logger from "@/utils/logger";

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
  if (config.scraper.debug) {
    logger.debug(
      `[debug] addPendingImageRecord page=${pageUrl} download=${downloadUrl} normalized=${normalized} storage=${storagePath}`,
    );
  }
}
