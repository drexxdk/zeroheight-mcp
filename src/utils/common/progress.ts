// Items-based progress tracker

import defaultLogger from "../logger";

export type ItemType = "page" | "image";
export type ItemStatus =
  | "pending"
  | "started"
  | "processed"
  | "redirected"
  | "external"
  | "failed"
  | "skipped";

export type ProgressItem = {
  url: string; // unique key for the item
  type: ItemType;
  status: ItemStatus;
  finalUrl?: string; // if redirected
  reason?: string; // failure or external reason
  updatedAt: number;
};

export type ProgressSnapshot = {
  current: number;
  total: number;
  pagesProcessed: number;
  imagesProcessed: number;
  pagesRedirected: number;
  pagesExternalIgnored: number;
  pagesFailed: number;
};
class ProgressService {
  private items = new Map<string, ProgressItem>();
  private lastPrinted = { current: 0, total: 0 };
  private reservedCounter = 0;

  // Helper to determine whether a status is terminal (counts towards "current")
  private isFinal(status: ItemStatus): boolean {
    return (
      status === "processed" ||
      status === "redirected" ||
      status === "external" ||
      status === "failed" ||
      status === "skipped"
    );
  }

  // Upsert an item by URL. Ensures there is only one item per URL.
  upsertItem({
    url,
    type,
    status,
    finalUrl,
    reason,
  }: {
    url: string;
    type: ItemType;
    status: ItemStatus;
    finalUrl?: string;
    reason?: string;
  }): ProgressItem {
    if (!url) throw new Error("url is required for progress item");
    const now = Date.now();
    const existing = this.items.get(url);
    if (existing) {
      // Avoid downgrading an item's status. Only apply the new status
      // if it represents the same or a later/terminal state.
      const rank = (s: ItemStatus): number => {
        switch (s) {
          case "pending":
            return 0;
          case "started":
            return 1;
          case "processed":
          case "redirected":
          case "external":
          case "failed":
          case "skipped":
            return 2;
          default:
            return 0;
        }
      };
      const existingRank = rank(existing.status);
      const newRank = rank(status);

      const appliedStatus = newRank >= existingRank ? status : existing.status;
      const merged: ProgressItem = {
        ...existing,
        status: appliedStatus,
        finalUrl: finalUrl ?? existing.finalUrl,
        reason: reason ?? existing.reason,
        updatedAt: now,
      };
      this.items.set(url, merged);
      // Only log a change if something meaningful changed
      if (
        merged.status !== existing.status ||
        merged.finalUrl !== existing.finalUrl ||
        merged.reason !== existing.reason
      ) {
        this.printChange(merged);
      }
      return merged;
    }

    const item: ProgressItem = {
      url,
      type,
      status,
      finalUrl,
      reason,
      updatedAt: now,
    };
    this.items.set(url, item);
    this.printChange(item, true);
    return item;
  }

  // Convenience to set status only if item exists or create it if not
  setItemStatus(
    url: string,
    status: ItemStatus,
    opts?: { finalUrl?: string; reason?: string; type?: ItemType },
  ): ProgressItem {
    return this.upsertItem({
      url,
      type: opts?.type ?? "page",
      status,
      finalUrl: opts?.finalUrl,
      reason: opts?.reason,
    });
  }

  // Return a snapshot of counts
  snapshot(): ProgressSnapshot {
    let pagesProcessed = 0;
    let imagesProcessed = 0;
    let pagesRedirected = 0;
    let pagesExternalIgnored = 0;
    let pagesFailed = 0;
    // `current` reflects work that has been started or finished.
    // Count any non-pending item (including `started`) as in-progress/completed.
    let current = 0;
    for (const item of this.items.values()) {
      if (item.status !== "pending") current += 1;
      if (item.type === "page") {
        if (item.status === "processed") pagesProcessed += 1;
        if (item.status === "redirected") pagesRedirected += 1;
        if (item.status === "external") pagesExternalIgnored += 1;
        if (item.status === "failed") pagesFailed += 1;
      }
      if (item.type === "image" && item.status === "processed")
        imagesProcessed += 1;
    }

    return {
      current,
      total: this.items.size,
      pagesProcessed,
      imagesProcessed,
      pagesRedirected,
      pagesExternalIgnored,
      pagesFailed,
    };
  }

  // Create reserved placeholder items to mimic previous reserve() behaviour.
  reserve(n = 1, reason?: string): void {
    if (n <= 0) return;
    for (let i = 0; i < n; i += 1) {
      const url = `__reserved__${Date.now()}_${this.reservedCounter++}`;
      this.upsertItem({ url, type: "page", status: "pending", reason });
    }
    this.print("📦", `${reason ?? "Reserved work"} (+${n})`);
  }

  // Start a unit of work. If a URL is provided treat it as the started item.
  start(context?: string): void {
    if (context && context.startsWith("http")) {
      this.setItemStatus(context, "started", { type: "page" });
      this.print("🔎", `Starting ${context}`);
      return;
    }
    // otherwise, consume one reserved placeholder and mark started
    const reserved = Array.from(this.items.values()).find(
      (i) => i.url.startsWith("__reserved__") && i.status === "pending",
    );
    if (reserved) {
      this.setItemStatus(reserved.url, "started");
      this.print("🔎", `Starting reserved work`);
      return;
    }
    // no reserved placeholders — create one and start it
    const url = `__reserved__${Date.now()}_${this.reservedCounter++}`;
    this.upsertItem({ url, type: "page", status: "started" });
    this.print("🔎", `Starting ${context ?? "work"}`);
  }

  // Backwards-compatible incremental counters that create items where possible
  incPages(n = 1): void {
    if (n <= 0) return;
    for (let i = 0; i < n; i += 1) {
      const url = `__page_counted__${Date.now()}_${this.reservedCounter++}`;
      this.upsertItem({ url, type: "page", status: "processed" });
    }
    const snap = this.snapshot();
    this.print("📄", `Pages processed ${snap.pagesProcessed}`);
  }

  incImages(n = 1): void {
    if (n <= 0) return;
    for (let i = 0; i < n; i += 1) {
      const url = `__image_counted__${Date.now()}_${this.reservedCounter++}`;
      this.upsertItem({ url, type: "image", status: "processed" });
    }
    const snap = this.snapshot();
    this.print("📷", `Images processed ${snap.imagesProcessed}`);
  }

  incRedirects(n = 1): void {
    if (n <= 0) return;
    for (let i = 0; i < n; i += 1) {
      const url = `__redirected__${Date.now()}_${this.reservedCounter++}`;
      this.upsertItem({ url, type: "page", status: "redirected" });
    }
    this.print(
      "🔁",
      `Redirects encountered ${this.snapshot().pagesRedirected}`,
    );
  }

  incExternalIgnored(n = 1): void {
    if (n <= 0) return;
    for (let i = 0; i < n; i += 1) {
      const url = `__external__${Date.now()}_${this.reservedCounter++}`;
      this.upsertItem({ url, type: "page", status: "external" });
    }
    this.print(
      "🚫",
      `External pages ignored ${this.snapshot().pagesExternalIgnored}`,
    );
  }

  // Mark an image URL as processed; returns true if newly added or newly processed
  markImageProcessed(url: string): boolean {
    if (!url) return false;
    const existing = this.items.get(url);
    if (
      existing &&
      existing.type === "image" &&
      existing.status === "processed"
    )
      return false;
    this.upsertItem({ url, type: "image", status: "processed" });
    return true;
  }

  // Internal printing with monotonic guarantees
  private print(icon: string, message: string): void {
    const snap = this.snapshot();
    const visibleCurrent = Math.max(snap.current, this.lastPrinted.current);
    const visibleTotal = Math.max(
      snap.total,
      visibleCurrent,
      this.lastPrinted.total,
    );

    const bar = this.renderBar(visibleCurrent, visibleTotal);
    try {
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

  private printChange(item: ProgressItem, isNew = false): void {
    const icon = isNew ? "➕" : "🔁";
    const msgParts = [`${item.type}`, item.url, item.status];
    if (item.finalUrl) msgParts.push(`-> ${item.finalUrl}`);
    if (item.reason) msgParts.push(`(${item.reason})`);
    this.print(icon, msgParts.join(" "));
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

  // Expose items for callers who want to list failures or details
  public getItems(): ProgressItem[] {
    return Array.from(this.items.values()).sort(
      (a, b) => a.updatedAt - b.updatedAt,
    );
  }
}

const service = new ProgressService();

export const getProgressSnapshot = (): ProgressSnapshot => service.snapshot();

export default service;

// New API: upsertItem and getItems for precise per-URL progress tracking
export const upsertItem = (opts: {
  url: string;
  type: ItemType;
  status: ItemStatus;
  finalUrl?: string;
  reason?: string;
}): ProgressItem => service.upsertItem(opts);

export const getItems = (): ProgressItem[] => service.getItems();
