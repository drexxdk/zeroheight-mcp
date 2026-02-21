/// <reference types="vitest/globals" />
import { describe, test, expect, vi } from "vitest";
import { bulkUpsertPagesAndImages } from "../bulkUpsert";
import logger from "@/utils/logger";
import {
  makeSupabaseStub,
  MockSupabaseClient,
  QueryChain,
} from "./testHelpers";

function makeConflictDb(): MockSupabaseClient {
  return makeSupabaseStub((_table: string) => ({
    select(): QueryChain<unknown> {
      return {
        in() {
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
      return {
        select: () =>
          Promise.resolve({
            data: [{ id: 42, url: "p1" }],
            error: { message: "conflict" },
          }),
      };
    },
    insert(_chunk: unknown) {
      return { select: () => Promise.resolve({ data: [] }) };
    },
  }));
}

describe("bulkUpsert conflict handling", () => {
  test("pushes data even when upsert returns data+error after retries", async () => {
    const db = makeConflictDb();
    const spy = vi.spyOn(logger, "error").mockImplementation(() => undefined);

    const res = await bulkUpsertPagesAndImages({
      db: db,
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
    expect(joined).toContain("Pages inserted: 1");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
