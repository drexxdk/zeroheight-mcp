/// <reference types="vitest/globals" />
import { describe, test, expect, vi } from "vitest";

vi.mock("../storageHelper", () => ({
  ensureBucket: vi.fn(),
  uploadWithFallback: vi.fn(),
}));

import { uploadBufferToStorage } from "../uploadHelpers";
import { ensureBucket, uploadWithFallback } from "../storageHelper";
import type { MockedFn, MockStorage } from "./testHelpers";

describe("uploadBufferToStorage", () => {
  test("returns path when upload succeeds", async (): Promise<void> => {
    (ensureBucket as unknown as MockedFn).mockResolvedValue(undefined);
    (uploadWithFallback as unknown as MockedFn).mockResolvedValue({
      data: { path: "images/p.webp" },
      error: null,
    });

    const storage: MockStorage = {
      upload: async () => ({ data: null, error: null }),
    };
    const res = await uploadBufferToStorage({
      storage,
      filename: "f",
      fileBuffer: Buffer.from("x"),
    });
    expect(uploadWithFallback).toHaveBeenCalled();
    expect(res.path).toBe("images/p.webp");
    expect(ensureBucket).toHaveBeenCalled();
  });

  test("returns upload_failed when retry returns null", async (): Promise<void> => {
    (ensureBucket as unknown as MockedFn).mockResolvedValue(undefined);
    (uploadWithFallback as unknown as MockedFn).mockResolvedValue({
      data: null,
      error: { message: "rls" },
    });

    const storage: MockStorage = {
      upload: async () => ({ data: null, error: null }),
    };
    const res = await uploadBufferToStorage({
      storage,
      filename: "f",
      fileBuffer: Buffer.from("x"),
    });
    expect(res.error).toBe("upload_failed");
  });
});
