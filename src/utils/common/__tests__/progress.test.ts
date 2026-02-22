/// <reference types="vitest/globals" />
import { upsertItem, getProgressSnapshot } from "../progress";

describe("progress singleton", () => {
  test("increment increases current and auto-reserves total", () => {
    // snapshot before
    const before = getProgressSnapshot();
    // start one unit of work by upserting a started item
    upsertItem({
      url: `test-start-${Date.now()}`,
      type: "page",
      status: "started",
    });
    const after = getProgressSnapshot();
    expect(after.current).toBe(before.current + 1);
    expect(after.total).toBeGreaterThanOrEqual(after.current);
  });

  test("reserve increases total", () => {
    const before = getProgressSnapshot();
    upsertItem({
      url: `test-reserve-${Date.now()}-1`,
      type: "page",
      status: "pending",
    });
    upsertItem({
      url: `test-reserve-${Date.now()}-2`,
      type: "page",
      status: "pending",
    });
    const after = getProgressSnapshot();
    expect(after.total).toBe(before.total + 2);
  });
});
