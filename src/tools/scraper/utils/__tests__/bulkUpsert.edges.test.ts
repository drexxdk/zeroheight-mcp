/// <reference types="vitest/globals" />
import { describe, test, expect } from "vitest";
import { bulkUpsertPagesAndImages } from "../bulkUpsert";
import {
  makeSupabaseStub,
  MockSupabaseClient,
  QueryChain,
} from "./testHelpers";

function makeTransientFailingDb({
  pagesFailTimes = 0,
  imagesFailTimes = 0,
  upsertResult = [{ id: 1, url: "p1" }],
  insertResult = [{ id: 1, original_url: "u1" }],
} = {}): MockSupabaseClient {
  let pagesCalls = 0;
  let imagesCalls = 0;
  return makeSupabaseStub((_table: string) => ({
    select(): QueryChain<unknown> {
      return {
        in() {
          return {
            limit() {
              return Promise.resolve({ data: [] });
            },
          };
        },
        ilike() {
          return Promise.resolve({ data: [] });
        },
        order() {
          return { limit: () => Promise.resolve({ data: [] }) };
        },
        then: (
          f: (
            v: import("@/utils/common/scraperHelpers").SupabaseResult<unknown>,
          ) => unknown,
        ) => Promise.resolve({ data: [] }).then(f),
      };
    },
    upsert(_chunk: unknown) {
      pagesCalls++;
      if (pagesCalls <= pagesFailTimes) {
        return { select: () => Promise.reject(new Error("transient upsert")) };
      }
      return { select: () => Promise.resolve({ data: upsertResult }) };
    },
    insert(_chunk: unknown) {
      imagesCalls++;
      if (imagesCalls <= imagesFailTimes) {
        return { select: () => Promise.reject(new Error("transient insert")) };
      }
      return { select: () => Promise.resolve({ data: insertResult }) };
    },
  }));
}

describe("bulkUpsert DB-edge cases", () => {
  test("retries pages upsert on transient failure and succeeds", async () => {
    const db = makeTransientFailingDb({
      pagesFailTimes: 1,
      upsertResult: [{ id: 10, url: "p1" }],
    });
    const res = await bulkUpsertPagesAndImages({
      db,
      pagesToUpsert: [{ url: "p1", title: "t1", content: "c1" }],
      pendingImageRecords: [],
      uniqueAllowedImageUrls: new Set(),
      uniqueAllImageUrls: new Set(),
      uniqueUnsupportedImageUrls: new Set(),
      allExistingImageUrls: new Set(),
      imagesStats: { processed: 0, uploaded: 0, skipped: 0, failed: 0 },
      pagesFailed: 0,
      providedCount: 1,
      dryRun: false,
    });
    const joined = res.lines.join("\n");
    expect(joined).toContain("Pages inserted");
  });

  test("retries images insert on transient failures and succeeds", async () => {
    const db = makeTransientFailingDb({
      imagesFailTimes: 1,
      upsertResult: [{ id: 10, url: "p1" }],
      insertResult: [{ id: 5, original_url: "u1" }],
    });
    const res = await bulkUpsertPagesAndImages({
      db,
      pagesToUpsert: [{ url: "p1", title: "t1", content: "c1" }],
      pendingImageRecords: [
        { pageUrl: "p1", original_url: "u1", storage_path: "s1" },
      ],
      uniqueAllowedImageUrls: new Set(["u1"]),
      uniqueAllImageUrls: new Set(["u1"]),
      uniqueUnsupportedImageUrls: new Set(),
      allExistingImageUrls: new Set(),
      imagesStats: { processed: 1, uploaded: 1, skipped: 0, failed: 0 },
      pagesFailed: 0,
      providedCount: 1,
      dryRun: false,
    });
    const joined = res.lines.join("\n");
    expect(joined).toContain("New associations between pages and images: 1");
  });

  test("throws when images insert consistently fails after retries", async () => {
    // Force images insert to fail more times than typical retry attempts by using a high fail count
    const db = makeTransientFailingDb({
      imagesFailTimes: 10,
      upsertResult: [{ id: 10, url: "p1" }],
    });
    await expect(
      bulkUpsertPagesAndImages({
        db,
        pagesToUpsert: [{ url: "p1", title: "t1", content: "c1" }],
        pendingImageRecords: [
          { pageUrl: "p1", original_url: "u1", storage_path: "s1" },
        ],
        uniqueAllowedImageUrls: new Set(["u1"]),
        uniqueAllImageUrls: new Set(["u1"]),
        uniqueUnsupportedImageUrls: new Set(),
        allExistingImageUrls: new Set(),
        imagesStats: { processed: 1, uploaded: 1, skipped: 0, failed: 0 },
        pagesFailed: 0,
        providedCount: 1,
        dryRun: false,
      }),
    ).rejects.toThrow();
  });
});
