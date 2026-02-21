/// <reference types="vitest/globals" />
import { describe, test, expect } from "vitest";
import { bulkUpsertPagesAndImages } from "../bulkUpsert";
import {
  makeSupabaseStub,
  MockSupabaseClient,
  QueryChain,
} from "./testHelpers";

type Resp = import("@/utils/common/scraperHelpers").SupabaseResult<unknown>;

function makeMockDb(responses: Record<string, Resp>): MockSupabaseClient {
  return makeSupabaseStub((table: string) => {
    return {
      select(_cols?: string) {
        const resp = responses[`${table}:select`];
        return {
          in(_: string, __: unknown) {
            return {
              limit(_n: number) {
                return Promise.resolve(
                  responses[`${table}:select.in.limit`] ?? resp ?? { data: [] },
                );
              },
              then(resolve: (v: Resp) => unknown) {
                return Promise.resolve(
                  responses[`${table}:select.in`] ?? resp ?? { data: [] },
                ).then(resolve);
              },
            };
          },
          ilike(_: string, __: string) {
            return Promise.resolve(
              responses[`${table}:select.ilike`] ?? { data: [] },
            );
          },
          order(_: string, __?: unknown) {
            return {
              limit: (_n: number) =>
                Promise.resolve(
                  responses[`${table}:select.order.limit`] ?? { data: [] },
                ),
            } as QueryChain<unknown>;
          },
          then(resolve: (v: Resp) => unknown) {
            return Promise.resolve(resp ?? { data: [] }).then(resolve);
          },
        } as QueryChain<unknown>;
      },
      upsert(_rows: unknown[], _opts?: { onConflict?: string }) {
        return {
          select: (_cols?: string) =>
            Promise.resolve(
              responses[`${table}:upsert.select`] ?? { data: [] },
            ),
        };
      },
      insert(_rows: unknown[]) {
        return {
          select: (_cols?: string) =>
            Promise.resolve(
              responses[`${table}:insert.select`] ?? { data: [] },
            ),
        };
      },
    };
  });
}

describe("bulkUpsertPagesAndImages DB flows", () => {
  test("inserts pages and images and reports counts", async () => {
    const pagesToUpsert = [
      { url: "p1", title: "t1", content: "c1" },
      { url: "p2", title: "t2", content: "c2" },
    ];
    const pendingImageRecords = [
      { pageUrl: "p1", original_url: "u1", storage_path: "s1" },
      { pageUrl: "p2", original_url: "u2", storage_path: "s2" },
    ];

    const responses: Record<string, Resp> = {
      "pages:select.in.limit": { data: [] },
      "pages:upsert.select": {
        data: [
          { id: 10, url: "p1" },
          { id: 11, url: "p2" },
        ],
      },
      "images:select.ilike": { data: [] },
      "images:select.in.limit": { data: [] },
      "images:insert.select": {
        data: [
          { id: 1, original_url: "u1" },
          { id: 2, original_url: "u2" },
        ],
      },
    };

    const db = makeMockDb(responses);

    const res = await bulkUpsertPagesAndImages({
      db,
      pagesToUpsert,
      pendingImageRecords,
      uniqueAllowedImageUrls: new Set(["u1", "u2"]),
      uniqueAllImageUrls: new Set(["u1", "u2"]),
      uniqueUnsupportedImageUrls: new Set(),
      allExistingImageUrls: new Set(),
      imagesStats: { processed: 2, uploaded: 2, skipped: 0, failed: 0 },
      pagesFailed: 0,
      providedCount: 2,
      dryRun: false,
    });

    // Expect the summary lines to include inserted image count 2
    const joined = res.lines.join("\n");
    expect(joined).toContain("Images uploaded: 2");
    expect(joined).toContain("New associations between pages and images: 2");
  });

  test("reports uniqueSkipped when DB has existing image", async () => {
    const pagesToUpsert = [{ url: "p1", title: "t1", content: "c1" }];
    const pendingImageRecords = [
      { pageUrl: "p1", original_url: "u1", storage_path: "s1" },
    ];

    const responses: Record<string, Resp> = {
      "pages:select.in.limit": { data: [] },
      "pages:upsert.select": { data: [{ id: 10, url: "p1" }] },
      // images existence check will return u1 as existing
      "images:select.in.limit": { data: [{ original_url: "u1" }] },
      "images:insert.select": { data: [{ id: 1, original_url: "u1" }] },
    };

    const db = makeMockDb(responses);

    const res = await bulkUpsertPagesAndImages({
      db,
      pagesToUpsert,
      pendingImageRecords,
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
    expect(joined).toContain("Unique images skipped:");
  });
});
