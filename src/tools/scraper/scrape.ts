import { z } from "zod";
import type { Page, Browser } from "puppeteer";
import { launchBrowser, attachDefaultInterception } from "./utils/puppeteer";
import { createErrorResponse } from "@/utils/toolResponses";
import { JobCancelled } from "@/utils/common/errors";
import {
  getClient,
  checkProgressInvariant,
} from "@/utils/common/supabaseClients";
import progressService, {
  progress as globalProgress,
  reserve as reserveProgress,
  increment as startProgress,
  getProgressSnapshot,
} from "@/utils/common/progress";
import type { PagesType, ImagesType } from "@/database.types";
import type { OverallProgress } from "./utils/processPageAndImages";
import { extractPageData } from "./utils/pageExtraction";
import type { ExtractedImage } from "./utils/pageExtraction";
import prefetchSeeds, { normalizeUrl } from "./utils/prefetch";
import { config } from "@/utils/config";
import defaultLogger from "@/utils/logger";
import { isRecord, getProp } from "@/utils/common/typeGuards";
// Removed unused imports to reduce lint warnings; helpers live in scrapeHelpers
import {
  loadExistingImageUrls,
  processLinkForWorker,
  logSummaryAndClose,
} from "./utils/scrapeHelpers";
import {
  createJobInDb,
  appendJobLog,
  finishJob,
  getJobFromDb,
} from "../tasks/utils/jobStore";
import { mapStatusToSep } from "../tasks/utils";
import { tryLogin } from "@/utils/common/scraperHelpers";
import type { TasksGetResult } from "../tasks/types";

export type ScrapeResult = {
  debug?: { seedUrl: string };
  progress: OverallProgress;
};

async function finalizeScrape({
  pagesToUpsert,
  pendingImageRecords,
  uniqueAllowedImageUrls,
  uniqueAllImageUrls,
  uniqueUnsupportedImageUrls,
  allExistingImageUrls,
  imagesStats,
  pagesFailed,
  providedCount,
  logger,
  browser,
  rootUrl,
  progress,
}: {
  pagesToUpsert: Array<Pick<PagesType, "url" | "title" | "content">>;
  pendingImageRecords: Array<{
    pageUrl: string;
    original_url: ImagesType["original_url"];
    storage_path: ImagesType["storage_path"];
  }>;
  uniqueAllowedImageUrls: Set<string>;
  uniqueAllImageUrls: Set<string>;
  uniqueUnsupportedImageUrls: Set<string>;
  allExistingImageUrls: Set<string>;
  imagesStats: {
    processed: number;
    uploaded: number;
    skipped: number;
    failed: number;
  };
  pagesFailed: number;
  providedCount: number;
  logger?: (s: string) => void;
  browser: Browser;
  rootUrl: string;
  progress: OverallProgress;
}): Promise<ScrapeResult> {
  return await logSummaryAndClose({
    pagesToUpsert,
    pendingImageRecords,
    uniqueAllowedImageUrls,
    uniqueAllImageUrls,
    uniqueUnsupportedImageUrls,
    allExistingImageUrls,
    imagesStats,
    pagesFailed,
    providedCount,
    logger,
    browser,
    rootUrl,
    progress,
  });
}

type PreExtracted = {
  title: string;
  content: string;
  supportedImages: ExtractedImage[];
  normalizedImages: Array<{ src: string; alt: string }>;
  pageLinks: string[];
};

type ProcessedPage = {
  url: PagesType["url"];
  title: PagesType["title"];
  content: PagesType["content"];
  images: Array<{ src: string; alt: string }>;
};

function buildPreExtractedFromSeed(v: unknown): PreExtracted {
  const title =
    typeof getProp(v, "title") === "string" ? String(getProp(v, "title")) : "";
  const content =
    typeof getProp(v, "content") === "string"
      ? String(getProp(v, "content"))
      : "";
  const supportedImagesRaw = getProp(v, "supportedImages");
  const supportedImages: ExtractedImage[] = Array.isArray(supportedImagesRaw)
    ? supportedImagesRaw.filter(
        (it): it is ExtractedImage =>
          isRecord(it) && typeof getProp(it, "src") === "string",
      )
    : [];
  const normRaw = getProp(v, "normalizedImages");
  const normalizedImages = Array.isArray(normRaw)
    ? normRaw
        .map((it) =>
          isRecord(it) && typeof getProp(it, "src") === "string"
            ? {
                src: String(getProp(it, "src")),
                alt: String(getProp(it, "alt") ?? ""),
              }
            : null,
        )
        .filter((x): x is { src: string; alt: string } => x !== null)
    : [];
  const pageLinksRaw = getProp(v, "pageLinks");
  const pageLinks = Array.isArray(pageLinksRaw)
    ? pageLinksRaw.filter((p): p is string => typeof p === "string")
    : [];
  return { title, content, supportedImages, normalizedImages, pageLinks };
}

async function prepareSeedsForScrape({
  browser,
  rootUrl,
  pageUrls,
  password,
  logger,
  preExtractedMap,
  enqueueLinks,
  loggedInHostnames,
}: {
  browser: Browser;
  rootUrl: string;
  pageUrls?: string[];
  password?: string;
  logger?: (s: string) => void;
  preExtractedMap: Map<string, PreExtracted>;
  enqueueLinks: (links: string[]) => number;
  loggedInHostnames: Set<string>;
}): Promise<void> {
  if (pageUrls && pageUrls.length > 0) {
    const normalized = pageUrls.map((p) =>
      normalizeUrl({ u: p, base: rootUrl }),
    );
    const { preExtractedMap: seedMap } = await prefetchSeeds({
      browser,
      rootUrl,
      seeds: normalized,
      password,
      concurrency: config.scraper.seedPrefetchConcurrency,
      logger,
    });

    for (const [k, v] of seedMap) {
      preExtractedMap.set(k, buildPreExtractedFromSeed(v));
    }

    if (password) loggedInHostnames.add(new URL(rootUrl).hostname);
    enqueueLinks(normalized);
    return;
  }

  const p = await browser.newPage();
  await p.setViewport({
    width: config.scraper.viewport.width,
    height: config.scraper.viewport.height,
  });
  try {
    await attachDefaultInterception(p).catch(() => {});
  } catch (e) {
    defaultLogger.warn("Failed to prefetch seeds:", e);
  }
  await p.goto(rootUrl, {
    waitUntil: config.scraper.viewport.navWaitUntil,
    timeout: config.scraper.viewport.navTimeoutMs,
  });
  if (password) {
    try {
      await tryLogin({ page: p, password });
      loggedInHostnames.add(new URL(rootUrl).hostname);
      if (logger) logger("Login attempt complete on root page");
    } catch (e) {
      if (logger) logger(`Login attempt failed: ${String(e)}`);
    }
  }

  const hostname = new URL(rootUrl).hostname;
  const fallbackRoot = {
    pageLinks: [] as string[],
    normalizedImages: [] as ExtractedImage[],
    supportedImages: [] as ExtractedImage[],
    title: "",
    content: "",
  };
  const extracted = await extractPageData({
    page: p,
    pageUrl: rootUrl,
    allowedHostname: hostname,
  }).catch(() => fallbackRoot);

  const anchors: string[] = await p
    .$$eval("a[href]", (links: Array<{ href?: string }>) =>
      links.map((a) => a.href || "").filter(Boolean),
    )
    .catch(() => []);

  const initialSet = new Set<string>();
  initialSet.add(normalizeUrl({ u: rootUrl }));
  for (const a of anchors)
    initialSet.add(normalizeUrl({ u: a, base: rootUrl }));
  for (const a of extracted.pageLinks || [])
    initialSet.add(normalizeUrl({ u: a, base: rootUrl }));
  const initial = Array.from(initialSet);
  if (logger) logger(`Seeded ${initial.length} initial links from root`);
  enqueueLinks(initial);
  try {
    await p.close();
  } catch (e) {
    defaultLogger.debug("Error reading image urls from DB:", e);
  }
}

async function processLinkUnit(
  options: {
    // Only list the fields used by the per-link processing logic
    rootUrl: string;
    password?: string;
    logger?: (s: string) => void;
    preExtractedMap: Map<string, PreExtracted>;
    pendingImageRecords: Array<{
      pageUrl: string;
      original_url: string;
      storage_path: string;
    }>;
    pagesToUpsert: Array<Pick<PagesType, "url" | "title" | "content">>;
    processedPages: Array<ProcessedPage>;
    imagesStats: {
      processed: number;
      uploaded: number;
      skipped: number;
      failed: number;
    };
    uniqueAllImageUrls: Set<string>;
    uniqueAllowedImageUrls: Set<string>;
    uniqueUnsupportedImageUrls: Set<string>;
    allExistingImageUrls: Set<string>;
    loggedInHostnames: Set<string>;
    redirects: Map<string, string>;
    processed: Set<string>;
    restrictToSeeds: boolean;
    enqueueLinks: (links: string[]) => number;
    formatLinkForConsole: (u: string) => string;
    logProgress: (icon: string, msg: string) => void;
    progress: OverallProgress;
    checkProgressInvariant: (p: OverallProgress, ctx: string) => void;
    onLinkDone?: () => void;
    touchLastActivity?: () => void;
    onPageError?: (link: string, err: unknown) => void;
  },
  page: Page,
  link: string,
): Promise<void> {
  const opts = options;
  try {
    // Mark this work unit as started so the visible `current` increases
    // immediately (prevents showing 0/total while starting work).
    try {
      startProgress(`start:${opts.formatLinkForConsole(link)}`);
      try {
        const s = getProgressSnapshot();
        if (s.current > s.total)
          opts.checkProgressInvariant(
            { current: s.current, total: s.total } as OverallProgress,
            `start:${opts.formatLinkForConsole(link)}`,
          );
      } catch {
        // best-effort
      }
    } catch {
      // best-effort
    }

    opts.logProgress("🔎", `Starting ${opts.formatLinkForConsole(link)}`);

    try {
      try {
        await processLinkForWorker({
          page,
          link,
          rootUrl: opts.rootUrl,
          password: opts.password,
          logger: opts.logger,
          preExtractedMap: opts.preExtractedMap,
          pendingImageRecords: opts.pendingImageRecords,
          pagesToUpsert: opts.pagesToUpsert,
          processedPages: opts.processedPages,
          imagesStats: opts.imagesStats,
          uniqueAllImageUrls: opts.uniqueAllImageUrls,
          uniqueAllowedImageUrls: opts.uniqueAllowedImageUrls,
          uniqueUnsupportedImageUrls: opts.uniqueUnsupportedImageUrls,
          allExistingImageUrls: opts.allExistingImageUrls,
          loggedInHostnames: opts.loggedInHostnames,
          redirects: opts.redirects,
          processed: opts.processed,
          restrictToSeeds: opts.restrictToSeeds,
          enqueueLinks: opts.enqueueLinks,
          formatLinkForConsole: opts.formatLinkForConsole,
          logProgress: opts.logProgress,
          progress: opts.progress,
          checkProgressInvariant: opts.checkProgressInvariant,
        });
      } finally {
        try {
          opts.onLinkDone?.();
        } catch (e) {
          defaultLogger.debug("onLinkDone handler failed:", e);
        }
        try {
          opts.touchLastActivity?.();
        } catch (e) {
          defaultLogger.debug("touchLastActivity handler failed:", e);
        }
      }
    } catch (e) {
      try {
        opts.onPageError?.(link, e);
      } catch (e2) {
        defaultLogger.debug("onPageError handler failed:", e2);
      }
    }
  } finally {
    // no-op here; page lifecycle is managed by caller
  }
}

async function runWorkerForScrape(options: {
  browser: Browser;
  shouldCancel?: () => boolean | Promise<boolean>;
  getNextLink: () => Promise<string | null>;
  logProgress: (icon: string, msg: string) => void;
  formatLinkForConsole: (u: string) => string;
  rootUrl: string;
  password?: string;
  logger?: (s: string) => void;
  preExtractedMap: Map<string, PreExtracted>;
  pendingImageRecords: Array<{
    pageUrl: string;
    original_url: string;
    storage_path: string;
  }>;
  pagesToUpsert: Array<Pick<PagesType, "url" | "title" | "content">>;
  processedPages: Array<ProcessedPage>;
  onPageError?: (link: string, err: unknown) => void;
  imagesStats: {
    processed: number;
    uploaded: number;
    skipped: number;
    failed: number;
  };
  uniqueAllImageUrls: Set<string>;
  uniqueAllowedImageUrls: Set<string>;
  uniqueUnsupportedImageUrls: Set<string>;
  allExistingImageUrls: Set<string>;
  loggedInHostnames: Set<string>;
  redirects: Map<string, string>;
  processed: Set<string>;
  restrictToSeeds: boolean;
  enqueueLinks: (links: string[]) => number;
  onLinkDone?: () => void;
  touchLastActivity?: () => void;
  progress: OverallProgress;
  checkProgressInvariant: (p: OverallProgress, ctx: string) => void;
}): Promise<void> {
  const { browser, shouldCancel, getNextLink } = options;
  const page: Page = await browser.newPage();
  await page.setViewport({
    width: config.scraper.viewport.width,
    height: config.scraper.viewport.height,
  });
  try {
    await attachDefaultInterception(page).catch(() => {});
  } catch (e) {
    defaultLogger.debug("URL parse failed while normalizing seed:", e);
  }

  try {
    while (true) {
      if (shouldCancel && (await Promise.resolve(shouldCancel())))
        throw new JobCancelled();
      const link = await getNextLink();
      if (!link) break;
      await processLinkUnit(
        {
          rootUrl: options.rootUrl,
          password: options.password,
          logger: options.logger,
          preExtractedMap: options.preExtractedMap,
          pendingImageRecords: options.pendingImageRecords,
          pagesToUpsert: options.pagesToUpsert,
          processedPages: options.processedPages,
          imagesStats: options.imagesStats,
          uniqueAllImageUrls: options.uniqueAllImageUrls,
          uniqueAllowedImageUrls: options.uniqueAllowedImageUrls,
          uniqueUnsupportedImageUrls: options.uniqueUnsupportedImageUrls,
          allExistingImageUrls: options.allExistingImageUrls,
          loggedInHostnames: options.loggedInHostnames,
          redirects: options.redirects,
          processed: options.processed,
          restrictToSeeds: options.restrictToSeeds,
          enqueueLinks: options.enqueueLinks,
          formatLinkForConsole: options.formatLinkForConsole,
          logProgress: options.logProgress,
          progress: options.progress,
          checkProgressInvariant: options.checkProgressInvariant,
          onLinkDone: options.onLinkDone,
          touchLastActivity: options.touchLastActivity,
          onPageError: options.onPageError,
        },
        page,
        link,
      );
    }
  } finally {
    try {
      await page.close();
    } catch (e) {
      defaultLogger.debug("Error in prefetch iteration:", e);
    }
  }
}

async function startWorkersForScrape(options: {
  concurrency: number;
  browser: Browser;
  shouldCancel?: () => boolean | Promise<boolean>;
  getNextLink: () => Promise<string | null>;
  logProgress: (icon: string, msg: string) => void;
  formatLinkForConsole: (u: string) => string;
  rootUrl: string;
  password?: string;
  logger?: (s: string) => void;
  preExtractedMap: Map<string, PreExtracted>;
  pendingImageRecords: Array<{
    pageUrl: string;
    original_url: string;
    storage_path: string;
  }>;
  pagesToUpsert: Array<Pick<PagesType, "url" | "title" | "content">>;
  processedPages: Array<ProcessedPage>;
  imagesStats: {
    processed: number;
    uploaded: number;
    skipped: number;
    failed: number;
  };
  uniqueAllImageUrls: Set<string>;
  uniqueAllowedImageUrls: Set<string>;
  uniqueUnsupportedImageUrls: Set<string>;
  allExistingImageUrls: Set<string>;
  loggedInHostnames: Set<string>;
  redirects: Map<string, string>;
  processed: Set<string>;
  restrictToSeeds: boolean;
  enqueueLinks: (links: string[]) => number;
  progress: OverallProgress;
  checkProgressInvariant: (p: OverallProgress, ctx: string) => void;
  onLinkDone?: () => void;
  touchLastActivity?: () => void;
  onPageError?: (link: string, err: unknown) => void;
}): Promise<Promise<void>[]> {
  const workers: Promise<void>[] = [];
  for (let i = 0; i < options.concurrency; i++) {
    workers.push(
      runWorkerForScrape({
        browser: options.browser,
        shouldCancel: options.shouldCancel,
        getNextLink: options.getNextLink,
        logProgress: options.logProgress,
        formatLinkForConsole: options.formatLinkForConsole,
        rootUrl: options.rootUrl,
        password: options.password,
        logger: options.logger,
        preExtractedMap: options.preExtractedMap,
        pendingImageRecords: options.pendingImageRecords,
        pagesToUpsert: options.pagesToUpsert,
        processedPages: options.processedPages,
        imagesStats: options.imagesStats,
        uniqueAllImageUrls: options.uniqueAllImageUrls,
        uniqueAllowedImageUrls: options.uniqueAllowedImageUrls,
        uniqueUnsupportedImageUrls: options.uniqueUnsupportedImageUrls,
        allExistingImageUrls: options.allExistingImageUrls,
        loggedInHostnames: options.loggedInHostnames,
        redirects: options.redirects,
        processed: options.processed,
        restrictToSeeds: options.restrictToSeeds,
        enqueueLinks: options.enqueueLinks,
        progress: options.progress,
        checkProgressInvariant: options.checkProgressInvariant,
        onLinkDone: options.onLinkDone,
        touchLastActivity: options.touchLastActivity,
        onPageError: options.onPageError,
      }),
    );
  }
  return workers;
}

async function monitorQueueLoop(options: {
  queue: string[];
  waiters: Array<(val: string | null) => void>;
  shouldCancel?: () => boolean | Promise<boolean>;
  idleTimeout: number;
  getLastActivity: () => number;
  getInProgressCount: () => number;
}): Promise<void> {
  const {
    queue,
    waiters,
    shouldCancel,
    idleTimeout,
    getLastActivity,
    getInProgressCount,
  } = options;
  while (true) {
    if (shouldCancel && (await Promise.resolve(shouldCancel()))) {
      while (waiters.length) {
        const w = waiters.shift()!;
        w(null);
      }
      throw new JobCancelled();
    }

    if (queue.length === 0 && getInProgressCount() === 0) {
      await new Promise((r) =>
        setTimeout(r, Math.min(config.scraper.monitor.idlePollMs, idleTimeout)),
      );
      if (
        queue.length === 0 &&
        getInProgressCount() === 0 &&
        Date.now() - getLastActivity() >= idleTimeout
      )
        break;
    }
    await new Promise((r) => setTimeout(r, config.scraper.monitor.pollMs));
  }
}

function formatUrlForConsole(u: string): string {
  try {
    const parsed = new URL(u);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return u;
  }
}

function makeQueueHelpers(opts: {
  q: string[];
  iq: Set<string>;
  rdirs: Map<string, string>;
  proc: Set<string>;
  wtrs: Array<(val: string | null) => void>;
  prog: OverallProgress;
  touchLastActivity: () => void;
  onDequeue: (item: string) => void;
  reserveLinks?: (n: number) => void;
}): {
  enqueueLinks: (links: string[]) => number;
  getNextLink: () => Promise<string | null>;
} {
  const {
    q: queueLocal,
    iq: inQueueLocal,
    rdirs: redirectsLocal,
    proc: processedLocal,
    wtrs: waitersLocal,
    prog: progressLocal,
    touchLastActivity,
    onDequeue,
  } = opts;
  function enqueueLinks(links: string[]): number {
    const added: string[] = [];
    for (const l of links) {
      const effective = redirectsLocal.get(l) ?? l;
      if (!processedLocal.has(effective) && !inQueueLocal.has(effective)) {
        inQueueLocal.add(effective);
        queueLocal.push(effective);
        added.push(effective);
      }
    }
    if (added.length) {
      if (typeof opts.reserveLinks === "function")
        opts.reserveLinks(added.length);
      else progressLocal.total += added.length;
      touchLastActivity();
      while (waitersLocal.length && queueLocal.length) {
        const w = waitersLocal.shift()!;
        const item = queueLocal.shift()!;
        inQueueLocal.delete(item);
        onDequeue(item);
        w(item);
      }
    }
    return added.length;
  }

  function getNextLink(): Promise<string | null> {
    if (queueLocal.length > 0) {
      const item = queueLocal.shift()!;
      inQueueLocal.delete(item);
      onDequeue(item);
      return Promise.resolve(item);
    }
    return new Promise((res) => waitersLocal.push(res));
  }

  return { enqueueLinks, getNextLink };
}

// Primary scraper (previously V2) - coordinator-based queue, deterministic totals, parallel workers
export async function scrape({
  rootUrl,
  password,
  pageUrls,
  logger,
  shouldCancel,
}: {
  rootUrl: string;
  password?: string;
  pageUrls?: string[];
  logger?: (s: string) => void;
  shouldCancel?: () => boolean | Promise<boolean>;
}): Promise<
  ScrapeResult | ReturnType<typeof createErrorResponse> | { message: string }
> {
  try {
    const concurrency = config.scraper.concurrency;
    const idleTimeout = config.scraper.idleTimeoutMs;
    const browser = await launchBrowser();
    const queue: string[] = [];
    const inQueue = new Set<string>();
    const processed = new Set<string>();
    const redirects = new Map<string, string>();
    let inProgressCount = 0;
    let lastActivity = Date.now();

    // Use singleton progress service (single source of truth)
    const progress = globalProgress;

    // Collectors for bulk upsert
    const pagesToUpsert: Array<Pick<PagesType, "url" | "title" | "content">> =
      [];
    const pendingImageRecords: Array<{
      pageUrl: string;
      original_url: ImagesType["original_url"];
      storage_path: ImagesType["storage_path"];
    }> = [];
    const imagesStats = { processed: 0, uploaded: 0, skipped: 0, failed: 0 };
    let pagesFailed = 0;
    const uniqueAllImageUrls = new Set<string>();
    const uniqueUnsupportedImageUrls = new Set<string>();
    const uniqueAllowedImageUrls = new Set<string>();

    const processedPages: Array<ProcessedPage> = [];

    const preExtractedMap: Map<string, PreExtracted> = new Map();

    const waiters: Array<(val: string | null) => void> = [];

    const logProgress = (icon: string, message: string): void => {
      try {
        progressService.log(icon, message);
      } catch {
        // best-effort
      }
      // Intentionally do not forward to the job `logger` here to avoid
      // duplicate lines without progress bars. The singleton `progressService`
      // is the authoritative emitter of progress lines and includes the
      // progress bar and counts.
    };

    const reserveLocal = (n: number, context?: string): void => {
      try {
        reserveProgress(n, context);
      } catch {
        // best-effort
      }
      try {
        const s = getProgressSnapshot();
        checkProgressInvariant({
          overallProgress: { current: s.current, total: s.total },
          context: context ?? "",
        });
      } catch {
        // best-effort
      }
    };

    const { enqueueLinks, getNextLink } = makeQueueHelpers({
      q: queue,
      iq: inQueue,
      rdirs: redirects,
      proc: processed,
      wtrs: waiters,
      prog: progress,
      touchLastActivity: () => {
        lastActivity = Date.now();
      },
      onDequeue: (item: string) => {
        inProgressCount++;
        // Log that an item was dequeued but do not mark it completed yet.
        try {
          logProgress("⏳", `Dequeued ${formatUrlForConsole(item)}`);
        } catch {
          // best-effort
        }
      },
      reserveLinks: (n: number) => reserveLocal(n, "enqueueLinks"),
    });

    const restrictToSeeds = !!(pageUrls && pageUrls.length > 0);

    const { client: db } = getClient();
    const loggedInHostnames = new Set<string>();
    // Load a pre-run snapshot of existing image URLs and keep an immutable
    // copy (`preExistingImageUrls`) to use for summary calculations. Create a
    // mutable copy (`allExistingImageUrls`) that workers may add to during the
    // run to prevent duplicate uploads.
    const preExistingImageUrls = await loadExistingImageUrls(db, logger);
    const allExistingImageUrls = new Set(preExistingImageUrls);

    await prepareSeedsForScrape({
      browser,
      rootUrl,
      pageUrls,
      password,
      logger,
      preExtractedMap,
      enqueueLinks,
      loggedInHostnames,
    });

    const workers = await startWorkersForScrape({
      concurrency,
      browser,
      shouldCancel,
      getNextLink,
      logProgress,
      formatLinkForConsole: formatUrlForConsole,
      rootUrl,
      password,
      logger,
      preExtractedMap,
      pendingImageRecords,
      pagesToUpsert,
      processedPages,
      imagesStats,
      uniqueAllImageUrls,
      uniqueAllowedImageUrls,
      uniqueUnsupportedImageUrls,
      allExistingImageUrls,
      loggedInHostnames,
      redirects,
      processed,
      restrictToSeeds,
      enqueueLinks,
      progress,
      checkProgressInvariant: (p: OverallProgress, ctx: string) =>
        checkProgressInvariant({
          overallProgress: { current: p.current, total: p.total },
          context: ctx,
        }),
      onLinkDone: () => {
        inProgressCount = Math.max(0, inProgressCount - 1);
        lastActivity = Date.now();
      },
      touchLastActivity: () => {
        lastActivity = Date.now();
      },
      onPageError: (link: string, err: unknown) => {
        pagesFailed++;
        if (logger)
          logger(
            `Error processing ${formatUrlForConsole(link)}: ${String(err)}`,
          );
      },
    });

    await monitorQueueLoop({
      queue,
      waiters,
      shouldCancel,
      idleTimeout,
      getLastActivity: () => lastActivity,
      getInProgressCount: () => inProgressCount,
    });

    while (waiters.length) {
      const w = waiters.shift()!;
      w(null);
    }

    await Promise.all(workers);

    // Finalize: bulk upsert, close browser, return result
    return await finalizeScrape({
      pagesToUpsert,
      pendingImageRecords,
      uniqueAllowedImageUrls,
      uniqueAllImageUrls,
      uniqueUnsupportedImageUrls,
      // Pass the immutable pre-run snapshot so the summary reflects the
      // database state at start-of-run.
      allExistingImageUrls: preExistingImageUrls,
      imagesStats,
      pagesFailed,
      providedCount: pageUrls && pageUrls.length > 0 ? pageUrls.length : 0,
      logger,
      browser,
      rootUrl,
      progress,
    });
  } catch (err) {
    if (err instanceof JobCancelled) return { message: "Job cancelled" };
    return createErrorResponse({
      message: String(err instanceof Error ? err.message : err),
    });
  }
}

import type { ToolDefinition } from "@/tools/toolTypes";
import type { ToolResponse } from "@/utils/toolResponses";

const scrapeInput = z.object({
  pageUrls: z.array(z.string()).optional(),
  password: z.string().optional(),
});

export const scrapeTool: ToolDefinition<
  typeof scrapeInput,
  ToolResponse | ScrapeResult | TasksGetResult | { message: string }
> = {
  title: "SCRAPER_scrape",
  description:
    "Start an asynchronous scraping job for the configured Zeroheight project. Seeds from the project root or provided page URLs; extracts pages and records page content and remote image URLs to the database as a background job.",
  inputSchema: scrapeInput,
  outputSchema: z.object({
    task: z.object({
      taskId: z.string(),
      status: z.string(),
      statusMessage: z.string().nullable().optional(),
      createdAt: z.string().nullable().optional(),
      lastUpdatedAt: z.string().nullable().optional(),
      ttl: z.number().optional(),
      pollInterval: z.number().optional(),
    }),
  }),
  handler: async ({ pageUrls, password }: z.infer<typeof scrapeInput>) => {
    const projectUrl = config.env.zeroheightProjectUrl;
    if (!projectUrl)
      return createErrorResponse({ message: "ZEROHEIGHT_PROJECT_URL not set" });

    let jobId: string;
    try {
      const created = await createJobInDb({
        name: "scrape",
        args: { pageUrls: pageUrls || null },
      });
      if (created) jobId = created;
      else
        jobId =
          Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    } catch (err) {
      defaultLogger.warn("createJobInDb failed:", err);
      jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    (async () => {
      const logger = async (s: string): Promise<void> => {
        try {
          await appendJobLog({
            jobId,
            line: `[${new Date().toISOString()}] ${s}`,
          });
        } catch (e) {
          defaultLogger.debug("Error during some scrape step:", e);
        }
        if (config.scraper.debug) defaultLogger.debug(`[debug] ${s}`);
        else defaultLogger.log(s);
      };

      try {
        const res = await scrape({
          rootUrl: projectUrl,
          password,
          pageUrls: pageUrls || undefined,
          logger: (msg: string) => {
            void logger(msg);
          },
          shouldCancel: async () => {
            try {
              const j = await getJobFromDb({ jobId });
              return !!(
                j &&
                (j.status === "cancelled" || j.status === "failed")
              );
            } catch {
              return false;
            }
          },
        });
        let structuredResult: unknown = res;
        if (
          isRecord(res) &&
          Object.prototype.hasOwnProperty.call(res, "progress")
        ) {
          const p = getProp(res, "progress");
          structuredResult = p ?? res;
        }
        await finishJob({ jobId, success: true, result: structuredResult });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        if (e instanceof JobCancelled) {
          await appendJobLog({ jobId, line: "Job cancelled by request" });
          await finishJob({ jobId, success: false });
        } else {
          await appendJobLog({ jobId, line: `Error: ${errMsg}` });
          await finishJob({
            jobId,
            success: false,
            result: undefined,
            errorMsg: errMsg,
          });
        }
      }
    })();

    const startedAt = new Date().toISOString();
    const taskResponse = {
      task: {
        taskId: jobId,
        status: mapStatusToSep({ status: "working" }),
        statusMessage: "Scraping is now in progress.",
        createdAt: startedAt,
        lastUpdatedAt: null,
        ttl: config.server.suggestedTtlMs,
        pollInterval: config.server.pollIntervalMs,
      },
    };
    // Return the structured `task` object directly; MCP registration will
    // normalize this domain-shaped result into a `ToolResponse` for JSON-RPC
    // consumers.
    const out: TasksGetResult = taskResponse;
    return out;
  },
};
