/// <reference types="vitest/globals" />
import { describe, test, expect, vi } from "vitest";

vi.mock("../retryHelpers", () => ({ retryWithBackoff: vi.fn() }));
vi.mock("../uploadHelpers", () => ({ uploadBufferToStorage: vi.fn() }));
vi.mock("../pendingRecords", () => ({ addPendingImageRecord: vi.fn() }));
vi.mock("../imageHelpers", () => ({
  normalizeImageUrl: vi.fn(),
  hashFilenameFromUrl: vi.fn(),
}));

import { processAndUploadImage } from "../imagePipeline";
import { retryWithBackoff } from "../retryHelpers";
import { uploadBufferToStorage } from "../uploadHelpers";
import { addPendingImageRecord } from "../pendingRecords";
import { normalizeImageUrl } from "../imageHelpers";
import type { MockedFn } from "./testHelpers";

describe("imagePipeline.processAndUploadImage", () => {
  test("successful upload calls pending record and logs progress", async () => {
    (retryWithBackoff as unknown as MockedFn).mockResolvedValue(
      Buffer.from("x"),
    );
    (uploadBufferToStorage as unknown as MockedFn).mockResolvedValue({
      path: "images/p.webp",
      error: null,
    });
    (normalizeImageUrl as unknown as MockedFn).mockImplementation(
      (arg: { src: string }) => arg.src + "-sanitized",
    );

    const pending: Array<{
      pageUrl: string;
      original_url: string;
      storage_path: string;
    }> = [];
    const log: Array<{ icon: string; message: string }> = [];
    const logProgress = (icon: string, message: string): void =>
      void log.push({ icon, message });

    const res = await processAndUploadImage({
      storage:
        {} as unknown as import("@/utils/common/scraperHelpers").StorageHelper,
      downloadUrl: "http://example.com/img.png",
      link: "http://page",
      logProgress,
      pendingImageRecords: pending,
      allExistingImageUrls: new Set(),
      filename: "f.webp",
    });

    expect(res.uploaded).toBe(true);
    expect(res.path).toBe("images/p.webp");
    expect(addPendingImageRecord).toHaveBeenCalled();
    expect(log.find((l) => l.icon === "✅")).toBeTruthy();
  });

  test("returns download_failed when retry returns null", async () => {
    (retryWithBackoff as unknown as MockedFn).mockResolvedValue(null);

    const res = await processAndUploadImage({
      storage:
        {} as unknown as import("@/utils/common/scraperHelpers").StorageHelper,
      downloadUrl: "http://example.com/img.png",
      link: "http://page",
      logProgress: () => undefined,
      pendingImageRecords: [],
      allExistingImageUrls: new Set(),
      filename: "f.webp",
    });

    expect(res.uploaded).toBe(false);
    expect(res.error).toBe("download_failed");
  });

  test("returns upload error when uploadBufferToStorage returns error", async () => {
    (retryWithBackoff as unknown as MockedFn).mockResolvedValue(
      Buffer.from("x"),
    );
    (uploadBufferToStorage as unknown as MockedFn).mockResolvedValue({
      path: undefined,
      error: "rls",
    });

    const res = await processAndUploadImage({
      storage:
        {} as unknown as import("@/utils/common/scraperHelpers").StorageHelper,
      downloadUrl: "http://example.com/img.png",
      link: "http://page",
      logProgress: () => undefined,
      pendingImageRecords: [],
      allExistingImageUrls: new Set(),
      filename: "f.webp",
    });

    expect(res.uploaded).toBe(false);
    expect(res.error).toBe("rls");
  });

  test("cancels before download when shouldCancel true", async () => {
    const res = await processAndUploadImage({
      storage:
        {} as unknown as import("@/utils/common/scraperHelpers").StorageHelper,
      downloadUrl: "http://example.com/img.png",
      link: "http://page",
      logProgress: () => undefined,
      pendingImageRecords: [],
      allExistingImageUrls: new Set(),
      shouldCancel: () => true,
      filename: "f.webp",
    });

    expect(res.uploaded).toBe(false);
    expect(res.error).toBe("Job cancelled");
  });
});
