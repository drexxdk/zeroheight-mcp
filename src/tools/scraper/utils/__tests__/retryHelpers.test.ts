/// <reference types="vitest/globals" />
import { retryWithBackoff } from "../retryHelpers";

describe("retryWithBackoff", () => {
  test("returns value when fn resolves non-null", async (): Promise<void> => {
    const res = await retryWithBackoff(async (): Promise<string> => "ok", {
      retries: 3,
      minDelayMs: 1,
      factor: 1,
    });
    expect(res).toBe("ok");
  });

  test("returns null after exhausting retries when fn always null", async (): Promise<void> => {
    const res = await retryWithBackoff(async (): Promise<null> => null, {
      retries: 2,
      minDelayMs: 1,
      factor: 1,
    });
    expect(res).toBeNull();
  });

  test("retries on thrown errors and eventually returns null", async (): Promise<void> => {
    let calls = 0;
    const fn = async (): Promise<null> => {
      calls++;
      if (calls < 2) throw new Error("boom");
      return null;
    };
    const res = await retryWithBackoff(fn, {
      retries: 2,
      minDelayMs: 1,
      factor: 1,
    });
    expect(res).toBeNull();
    expect(calls).toBe(2);
  });
});
