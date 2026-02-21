import { z } from "zod";
import type { Page, Browser } from "puppeteer";
import { launchBrowser, attachDefaultInterception } from "./utils/puppeteer";
import { createErrorResponse } from "@/utils/toolResponses";
import { JobCancelled } from "@/utils/common/errors";
import {
  getClient,
  checkProgressInvariant,
} from "@/utils/common/supabaseClients";
import { createProgressHelpers } from "./utils/shared";
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
  enqueueLinks: (links: string[]) => void;
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
  enqueueLinks: (links: string[]) => void;
  onLinkDone?: () => void;
  touchLastActivity?: () => void;
  progress: OverallProgress;
  checkProgressInvariant: (p: OverallProgress, ctx: string) => void;
}): Promise<void> {
  const {
    browser,
    shouldCancel,
    getNextLink,
    logProgress,
    formatLinkForConsole,
  } = options;
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
      logProgress("🔎", `Starting ${formatLinkForConsole(link)}`);
      try {
        try {
          await processLinkForWorker({
            page,
            link,
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
            formatLinkForConsole: formatLinkForConsole,
            logProgress: options.logProgress,
            progress: options.progress,
            checkProgressInvariant: options.checkProgressInvariant,
          });
        } finally {
          try {
            options.onLinkDone?.();
          } catch (e) {
            defaultLogger.debug("onLinkDone handler failed:", e);
          }
          try {
            options.touchLastActivity?.();
          } catch (e) {
            defaultLogger.debug("touchLastActivity handler failed:", e);
          }
        }
      } catch (e) {
        try {
          options.onPageError?.(link, e);
        } catch (e2) {
          defaultLogger.debug("onPageError handler failed:", e2);
        }
      }
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
  enqueueLinks: (links: string[]) => void;
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
}): {
  enqueueLinks: (links: string[]) => void;
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
  function enqueueLinks(links: string[]): void {
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
      progressLocal.total += added.length;
      touchLastActivity();
      while (waitersLocal.length && queueLocal.length) {
        const w = waitersLocal.shift()!;
        const item = queueLocal.shift()!;
        inQueueLocal.delete(item);
        onDequeue(item);
        w(item);
      }
    }
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

    const progress: OverallProgress = {
      current: 0,
      total: 0,
      pagesProcessed: 0,
      imagesProcessed: 0,
    };

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
      onDequeue: (_item: string) => {
        inProgressCount++;
        progress.current++;
      },
    });
    const { logProgress } = createProgressHelpers({
      progress,
      checkProgressInvariant,
      logger,
    });

    const restrictToSeeds = !!(pageUrls && pageUrls.length > 0);

    const { client: db } = getClient();
    const loggedInHostnames = new Set<string>();
    const allExistingImageUrls = await loadExistingImageUrls(db, logger);

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
      allExistingImageUrls,
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
