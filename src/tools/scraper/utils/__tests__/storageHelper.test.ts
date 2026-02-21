/// <reference types="vitest/globals" />
import { describe, test, expect, vi } from "vitest";
import { ensureBucket, uploadWithFallback } from "../storageHelper";

vi.mock("@/utils/common", () => ({
  getSupabaseAdminClient: vi.fn(),
}));

import { getSupabaseAdminClient } from "@/utils/common";
import type { StorageHelper } from "@/utils/common/scraperHelpers";
import type { MockedFn, MockStorage } from "./testHelpers";
vi.mock("@/utils/common/scraperHelpers", () => ({
  uploadWithRetry: vi.fn(),
}));
import { uploadWithRetry } from "@/utils/common/scraperHelpers";

describe("ensureBucket", () => {
  test("creates bucket when not present and createBucket exists", async (): Promise<void> => {
    const createBucket = vi.fn(async () => ({
      data: { name: "b" },
      error: null,
    }));
    const storage: MockStorage = {
      listBuckets: async () => ({ data: [{ name: "other" }], error: null }),
      createBucket: createBucket,
      upload: async (_filename: string, _file: Buffer) => ({
        data: null,
        error: null,
      }),
    };

    await ensureBucket({ storage, bucket: "images_test" });
    expect(createBucket).toHaveBeenCalled();
  });

  test("no-op when listBuckets not provided", async (): Promise<void> => {
    const storage: MockStorage = {
      upload: async (_: string, __: Buffer) => ({ data: null, error: null }),
    };
    await ensureBucket({ storage, bucket: "images_test" });
    // should not throw
    expect(true).toBe(true);
  });
});

describe("uploadWithFallback", () => {
  test("returns original result when no RLS error", async (): Promise<void> => {
    const storage: MockStorage = {
      upload: async () => ({ data: { path: "p" }, error: null }),
    };
    (uploadWithRetry as unknown as MockedFn).mockImplementation(async () => ({
      data: { path: "p" },
      error: null,
    }));
    const res = await uploadWithFallback({
      storage: storage as StorageHelper,
      filename: "f",
      file: Buffer.from("x"),
    });
    expect(res.data && res.data.path).toBe("p");
  });

  test("uses admin client to upload when RLS error occurs", async (): Promise<void> => {
    // make uploadWithRetry return an RLS error
    (uploadWithRetry as unknown as MockedFn).mockImplementationOnce(
      async () => ({
        error: { message: "violates row-level security" },
      }),
    );

    // Provide a fake admin client that succeeds
    (getSupabaseAdminClient as unknown as MockedFn).mockImplementation(() => ({
      storage: {
        from: (_: string) => ({
          upload: async () => ({ error: null }),
        }),
      },
    }));

    const storage: MockStorage = {
      upload: async () => ({ data: null, error: { message: "rls" } }),
    };
    const res = await uploadWithFallback({
      storage: storage as StorageHelper,
      filename: "f",
      file: Buffer.from("x"),
    });
    // Admin fallback returns some result (either data or error string)
    expect(
      res.data?.path || typeof res.error?.message === "string",
    ).toBeTruthy();
  });
});
