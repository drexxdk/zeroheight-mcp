import type { Browser, Page } from "puppeteer";
import { config } from "@/utils/config";
import defaultLogger from "@/utils/logger";

export default class PagePool {
  private browser: Browser;
  private maxPages: number;
  private available: Page[] = [];
  private pending: Array<(p: Page) => void> = [];

  constructor(browser: Browser, maxPages?: number) {
    this.browser = browser;
    this.maxPages =
      typeof maxPages === "number"
        ? maxPages
        : Math.max(1, config.scraper.seedPrefetchConcurrency || 2);
  }

  async acquire(): Promise<Page> {
    if (this.available.length > 0) return this.available.pop()!;
    const total = this.available.length + this.pending.length;
    if (total < this.maxPages) {
      try {
        const p = await this.browser.newPage();
        await p.setViewport({
          width: config.scraper.viewport.width,
          height: config.scraper.viewport.height,
        });
        return p;
      } catch (e) {
        defaultLogger.debug("PagePool newPage failed:", e);
        throw e;
      }
    }

    return await new Promise<Page>((resolve) => this.pending.push(resolve));
  }

  release(p: Page): void {
    if (this.pending.length > 0) {
      const waiter = this.pending.shift()!;
      waiter(p);
      return;
    }
    this.available.push(p);
  }

  async closeAll(): Promise<void> {
    // Close all available pages
    while (this.available.length) {
      const p = this.available.pop()!;
      try {
        await p.close();
      } catch (e) {
        defaultLogger.debug("PagePool close failed:", e);
      }
    }
    // Pending waiters: nothing to give them
    this.pending = [];
  }
}
