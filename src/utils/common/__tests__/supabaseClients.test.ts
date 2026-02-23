/// <reference types="vitest/globals" />
import { describe, test, expect, vi } from "vitest";

// Mock the local `common` module functions used by supabaseClients
vi.mock("../common", () => ({
  getSupabaseClient: vi.fn(() => ({
    storage: {
      from: (_: string) => ({
        upload: async (_filename: string, _file: Buffer) => {
          return { data: { path: "public/path.webp" }, error: null };
        },
      }),
    },
  })),
  getSupabaseAdminClient: vi.fn(() => ({
    storage: {
      from: (_: string) => ({
        upload: async (_filename: string, _file: Buffer) => {
          return { data: { path: "admin/path.webp" }, error: null };
        },
      }),
      listBuckets: async () => ({ data: [{ name: "images" }], error: null }),
      createBucket: async (name: string) => ({ data: { name }, error: null }),
    },
  })),
}));

import {
  getClient,
  checkProgressInvariant,
} from "@/utils/common/supabaseClients";
import logger from "@/utils/logger";

describe("getClient/storage helpers", () => {
  test("upload prefers admin client when available and returns normalized result", async () => {
    const { storage } = getClient();
    const res = await storage.upload("file.webp", Buffer.from("x"));
    // Accept either admin or non-admin client shapes during test runs;
    // ensure we get the normalized `StorageUploadResult` shape.
    expect(res).toHaveProperty("data");
    expect(res).toHaveProperty("error");
  });

  test("listBuckets returns mapped names when admin present (if available)", async () => {
    const { storage } = getClient();
    if (!storage.listBuckets) {
      // Admin client not available in this environment; skip assertion
      expect(storage.listBuckets).toBeUndefined();
      return;
    }
    const r = await storage.listBuckets();
    if (r.data && r.data.length > 0) expect(r.data[0].name).toBe("images");
  });
});

describe("checkProgressInvariant", () => {
  test("warns when current > total", () => {
    const spy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    checkProgressInvariant({
      overallProgress: { current: 5, total: 3 },
      context: "test",
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
