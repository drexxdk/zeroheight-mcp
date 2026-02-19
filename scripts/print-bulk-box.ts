#!/usr/bin/env tsx
// Run with: npx tsx scripts/print-bulk-box.ts

// Lightweight script to render the same boxed summary used by bulkUpsert
import "dotenv/config";
import {
  formatSummaryBox,
  SummaryParams,
} from "../src/tools/scraper/utils/bulkUpsert";

async function main() {
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
  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
