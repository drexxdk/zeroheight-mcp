/// <reference types="vitest/globals" />
import {
  createProgressBar,
  increment,
  reserve,
  getProgressSnapshot,
} from "../progress";

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

describe("progress singleton", () => {
  test("increment increases current and auto-reserves total", () => {
    // snapshot before
    const before = getProgressSnapshot();
    // start one unit of work
    increment("test-increment");
    const after = getProgressSnapshot();
    expect(after.current).toBe(before.current + 1);
    expect(after.total).toBeGreaterThanOrEqual(after.current);
  });

  test("reserve increases total", () => {
    const before = getProgressSnapshot();
    reserve(2, "test-reserve");
    const after = getProgressSnapshot();
    expect(after.total).toBe(before.total + 2);
  });
});
