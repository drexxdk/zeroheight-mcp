/// <reference types="vitest/globals" />
import { vi } from "vitest";
import { createProgressBar, createProgressHelpers } from "../progress";

describe("createProgressBar", () => {
  test("renders filled and empty blocks proportionally", () => {
    const bar = createProgressBar({ current: 5, total: 10, width: 10 });
    // 5 filled, 5 empty
    expect(bar).toMatch(/^\[█{5}░{5}\]$/);
  });

  test("guards against total=0 without throwing", () => {
    const bar = createProgressBar({ current: 0, total: 0, width: 8 });
    expect(bar).toMatch(/^\[.{8}\]$/);
  });
});

describe("createProgressHelpers", () => {
  test("markAttempt increments and calls invariant and logger", () => {
    const progress = { current: 0, total: 2 };
    const calls: string[] = [];
    const logger = (m: string): void => {
      calls.push(m);
    };
    const check = vi.fn();

    const { markAttempt } = createProgressHelpers({
      progress,
      checkProgressInvariant: ({ overallProgress }): void =>
        check(overallProgress),
      logger,
    });

    markAttempt("reason", "⚑", "did a thing");

    expect(progress.current).toBe(1);
    expect(check).toHaveBeenCalled();
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]).toContain("did a thing");
  });
});
