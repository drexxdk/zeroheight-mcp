/// <reference types="vitest/globals" />
import { addPendingImageRecord, PendingImageRecord } from "../pendingRecords";
import { normalizeImageUrl } from "../imageHelpers";

describe("addPendingImageRecord", () => {
  test("adds normalized pending record and updates set", () => {
    const pending: PendingImageRecord[] = [];
    const set = new Set<string>();
    const pageUrl = "https://example.com/page";
    const downloadUrl = "https://example.com/images/a.png?size=1";
    const storage = "images/a.png";

    addPendingImageRecord({
      pendingImageRecords: pending,
      pageUrl,
      downloadUrl,
      storagePath: storage,
      allExistingImageUrls: set,
    });

    expect(pending.length).toBe(1);
    expect(pending[0].pageUrl).toBe(pageUrl);
    expect(pending[0].storage_path).toBe(storage);
    // normalized url should be in set and match normalizeImageUrl
    expect(set.has(normalizeImageUrl({ src: downloadUrl }))).toBe(true);
  });
});
