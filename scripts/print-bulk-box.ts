#!/usr/bin/env tsx
// Run with: npx tsx scripts/print-bulk-box.ts

// Lightweight script to render the same boxed summary used by bulkUpsert
import "dotenv/config";
import logger from "../src/utils/logger";
import { formatSummaryBox } from "../src/tools/scraper/utils/bulkUpsert";
import type { SummaryParams } from "../src/tools/scraper/utils/bulkUpsertHelpers";

async function main(): Promise<void> {
  const params: SummaryParams = {
    providedCount: 2,
    pagesAnalyzed: 2,
    insertedCount: 0,
    updatedCount: 2,
    skippedCount: 0,
    pagesFailed: 0,
    uniqueTotalImages: 9,
    uniqueUnsupported: 2,
    uniqueAllowed: 7,
    imagesUploadedCount: 0,
    uniqueSkipped: 7,
    imagesFailed: 0,
    imagesDbInsertedCount: 0,
    imagesAlreadyAssociatedCount: 7,
  };

  const lines = formatSummaryBox({ p: params });
  logger.log(lines.join("\n"));
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
