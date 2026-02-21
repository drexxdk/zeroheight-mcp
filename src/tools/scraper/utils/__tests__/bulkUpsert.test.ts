/// <reference types="vitest/globals" />
import { formatSummaryBox } from "../bulkUpsert";

describe("formatSummaryBox", () => {
  test("returns boxed summary lines containing key stats", async (): Promise<void> => {
    const params = {
      providedCount: 2,
      pagesAnalyzed: 2,
      insertedCount: 1,
      updatedCount: 1,
      skippedCount: 0,
      pagesFailed: 0,
      uniqueTotalImages: 5,
      uniqueUnsupported: 1,
      uniqueAllowed: 4,
      imagesUploadedCount: 3,
      uniqueSkipped: 0,
      imagesFailed: 0,
      imagesDbInsertedCount: 2,
      imagesAlreadyAssociatedCount: 1,
    } as const;

    const lines = formatSummaryBox({ p: params });
    expect(Array.isArray(lines)).toBe(true);
    const joined = lines.join("\n");
    expect(joined).toContain("Pages provided: 2");
    expect(joined).toContain("Images found: 5 (unique)");
    expect(joined).toContain("Images uploaded: 3");
  });
});
