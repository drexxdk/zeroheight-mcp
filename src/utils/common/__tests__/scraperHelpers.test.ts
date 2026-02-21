/// <reference types="vitest/globals" />
import { retryAsync, uploadWithRetry } from "../scraperHelpers";
import { vi } from "vitest";

describe("retryAsync", () => {
  test("returns result when fn succeeds", async (): Promise<void> => {
    const res = await retryAsync({
      fn: async () => 42,
      retries: 2,
      delayMs: 1,
    });
    expect(res).toBe(42);
  });

  test("retries until success", async (): Promise<void> => {
    let calls = 0;
    const fn = async (): Promise<string> => {
      calls++;
      if (calls < 3) throw new Error("fail");
      return "ok";
    };
    const res = await retryAsync({ fn, retries: 5, delayMs: 1 });
    expect(res).toBe("ok");
    expect(calls).toBe(3);
  });

  test("throws after exhausting retries", async (): Promise<void> => {
    const fn = async (): Promise<void> => {
      throw new Error("nope");
    };
    await expect(retryAsync({ fn, retries: 2, delayMs: 1 })).rejects.toThrow(
      "nope",
    );
  });
});

describe("uploadWithRetry", () => {
  test("returns storage upload result when upload succeeds", async (): Promise<void> => {
    const storage = {
      upload: vi.fn(async (_: string, __: Buffer) => ({
        data: { path: "p" },
        error: null,
      })),
    };
    const res = await uploadWithRetry({
      storage,
      filename: "f",
      file: Buffer.from("x"),
    });
    expect(res.data?.path).toBe("p");
  });

  test("returns error object when upload fails", async (): Promise<void> => {
    const storage = {
      upload: vi.fn(async () => {
        throw new Error("boom");
      }),
    };
    const res = await uploadWithRetry({
      storage,
      filename: "f",
      file: Buffer.from("x"),
    });
    expect(res.error).toBeTruthy();
    expect(res.error?.message).toContain("boom");
  });
});
