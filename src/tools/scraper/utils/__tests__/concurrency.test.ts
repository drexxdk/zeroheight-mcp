/// <reference types="vitest/globals" />
import { mapWithConcurrency } from "../concurrency";

describe("mapWithConcurrency", () => {
  test("maps items with concurrency and preserves order", async (): Promise<void> => {
    const items = [1, 2, 3, 4, 5];
    const mapper = async (n: number): Promise<number> => {
      await new Promise((r) => setTimeout(r, 1));
      return n * 2;
    };
    const res = await mapWithConcurrency(items, mapper, 2);
    expect(res).toEqual([2, 4, 6, 8, 10]);
  });
});
