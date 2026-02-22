// previous progress helpers (refactored)

import defaultLogger from "../logger";

type ProgressSnapshot = {
  current: number;
  total: number;
  pagesProcessed: number;
  imagesProcessed: number;
};

class ProgressService {
  private state: ProgressSnapshot = {
    current: 0,
    total: 0,
    pagesProcessed: 0,
    imagesProcessed: 0,
  };

  // last values printed to console — we never print a lower value than these
  private lastPrinted = { current: 0, total: 0 };
  // Track normalized image URLs that have been counted so far so the
  // ProgressService is the single source of truth for image counts.
  private processedImageUrls = new Set<string>();

  // public API -----------------------------------------------------------
  getCurrent(): number {
    return this.state.current;
  }

  getTotal(): number {
    return this.state.total;
  }

  // Visible (clamped) values used for logging/externally-read progress so
  // printed numbers never appear to decrease even if internal state lags
  getVisibleCurrent(): number {
    return Math.max(this.state.current, this.lastPrinted.current);
  }

  getVisibleTotal(): number {
    return Math.max(
      this.state.total,
      this.getVisibleCurrent(),
      this.lastPrinted.total,
    );
  }

  // Reserve increases the total (e.g. discovered links or reserved images)
  reserve(n = 1, reason?: string): void {
    if (n <= 0) return;
    this.state.total += n;
    this.print("📦", `${reason ?? "Reserved work"} (+${n})`);
  }

  // Called when a worker starts a unit of work. This immediately increases current.
  start(context?: string): void {
    this.state.current += 1;
    // If a worker starts a unit that wasn't previously reserved, ensure
    // `total` never falls behind `current`. We auto-reserve the delta so
    // the console invariants remain monotonic and meaningful.
    if (this.state.total < this.state.current) {
      const delta = this.state.current - this.state.total;
      this.state.total = this.state.current;
      this.print("📦", `Auto-reserved to match started tasks (+${delta})`);
    }

    this.print("🔎", `Starting ${context ?? "work"}`);
  }

  // Completion counters — should NOT decrement `current`.
  incPages(n = 1): void {
    if (n <= 0) return;
    this.state.pagesProcessed += n;
    this.print("📄", `Pages processed ${this.state.pagesProcessed}`);
  }

  incImages(n = 1): void {
    if (n <= 0) return;
    this.state.imagesProcessed += n;
    this.print("📷", `Images processed ${this.state.imagesProcessed}`);
  }

  // Mark a normalized image URL as processed. Returns true if this call
  // caused the global images counter to increase (i.e. the URL was seen
  // for the first time), otherwise false.
  markImageProcessed(url: string): boolean {
    if (!url) return false;
    try {
      if (this.processedImageUrls.has(url)) return false;
      this.processedImageUrls.add(url);
      this.incImages(1);
      return true;
    } catch {
      return false;
    }
  }

  snapshot(): ProgressSnapshot {
    // return a shallow copy so callers cannot mutate internal state
    return { ...this.state };
  }

  // Internal printing --------------------------------------------------
  private print(icon: string, message: string): void {
    // Ensure printed values are monotonic (never decrease in the console)
    const visibleCurrent = Math.max(
      this.state.current,
      this.lastPrinted.current,
    );
    // total must be at least visibleCurrent when printing so ratios make sense
    const visibleTotal = Math.max(
      this.state.total,
      visibleCurrent,
      this.lastPrinted.total,
    );

    const bar = this.renderBar(visibleCurrent, visibleTotal);
    // Single-line debug-style output used across the scraper
    // Use console.debug so the logger can be filtered; other code previously used [debug] prefixes
    // Keep the output concise and monotonic.
    // Example: [██████░░░░░░] [3/10] 🔎 Starting https://...
    try {
      // update lastPrinted only after successful formatting to keep monotonic guarantee
      // Always show the progress bar to the user, not just in debug mode.
      defaultLogger.log(
        `[${bar}] [${visibleCurrent}/${visibleTotal}] ${icon} ${message}`,
      );
    } finally {
      this.lastPrinted.current = Math.max(
        this.lastPrinted.current,
        visibleCurrent,
      );
      this.lastPrinted.total = Math.max(this.lastPrinted.total, visibleTotal);
    }
  }

  private renderBar(current: number, total: number, width = 20): string {
    if (total <= 0) return " ".repeat(width);
    const pct = Math.min(1, current / total);
    const filled = Math.round(pct * width);
    return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
  }

  // Expose a logging method so other helpers can delegate to the singleton
  public log(icon: string, message: string): void {
    this.print(icon, message);
  }
}

// Single exported instance — the one source of truth
const service = new ProgressService();

// Exported convenience helpers (preserve previous function names used across codebase)
export const progress = {
  get current(): number {
    return service.getVisibleCurrent();
  },
  get total(): number {
    return service.getVisibleTotal();
  },
  get pagesProcessed(): number {
    return service.snapshot().pagesProcessed;
  },
  get imagesProcessed(): number {
    return service.snapshot().imagesProcessed;
  },
};

export const reserve = (n = 1, reason?: string): void =>
  service.reserve(n, reason);
export const increment = (context?: string): void => service.start(context);
export const incPages = (n = 1): void => service.incPages(n);
export const incImages = (n = 1): void => service.incImages(n);
export const markImageProcessed = (url: string): boolean =>
  service.markImageProcessed(url);
export const getProgressSnapshot = (): ProgressSnapshot => service.snapshot();

export default service;
export type Progress = {
  current: number;
  total: number;
  pagesProcessed?: number;
  imagesProcessed?: number;
};

export function createProgressBar({
  current,
  total,
  width = 20,
}: {
  current: number;
  total: number;
  width?: number;
}): string {
  // Guard against division by zero
  const safeTotal = total <= 0 ? 1 : total;
  const filledBars = Math.min(Math.round((current / safeTotal) * width), width);
  const emptyBars = width - filledBars;
  const progressBar = "█".repeat(filledBars) + "░".repeat(emptyBars);
  return `[${progressBar}]`;
}

// Compatibility wrapper removed: callers should use singleton helpers exported above.
