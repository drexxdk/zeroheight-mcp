import defaultLogger from "@/utils/logger";
import { getClient } from "@/utils/common/supabaseClients";
import { formatSummaryBox, bulkUpsertPagesAndImages } from "./bulkUpsert";
import type { ImagesType, PagesType } from "@/database.types";
import type { OverallProgress } from "./processPageAndImages";
import type { ExtractedImage } from "./pageExtraction";
import type { SummaryParams } from "./bulkUpsertHelpers";
import type { Page, Browser } from "puppeteer";
import { tryLogin } from "@/utils/common/scraperHelpers";
import { extractPageData } from "./pageExtraction";
import { processPageAndImages } from "./processPageAndImages";
import { normalizeUrl } from "./prefetch";
import {
  reserve as reserveGlobally,
  incPages as incPagesGlobally,
  incRedirects as incRedirectsGlobally,
  getProgressSnapshot,
} from "@/utils/common/progress";
import { config } from "@/utils/config";

type PreExtracted = {
  title: string;
  content: string;
  supportedImages: ExtractedImage[];
  normalizedImages: Array<{ src: string; alt: string }>;
  pageLinks: string[];
};

export function formatPathForConsole(u: string): string {
  try {
    const parsed = new URL(u);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return u;
  }
}

export async function navigateAndResolveProcessingLink(args: {
  page: Page;
  link: string;
  rootUrl: string;
  password?: string;
  logger?: (s: string) => void;
  loggedInHostnames: Set<string>;
  redirects: Map<string, string>;
  processed: Set<string>;
  formatLinkForConsole: (u: string) => string;
  progress: OverallProgress;
}): Promise<string | null> {
  const {
    page,
    link,
    rootUrl,
    password,
    logger,
    loggedInHostnames,
    redirects,
    processed,
    formatLinkForConsole,
  } = args;
  // `rootUrl` removed from args list; ensure not referenced below

  await page.goto(link, {
    waitUntil: config.scraper.viewport.navWaitUntil,
    timeout: config.scraper.viewport.navTimeoutMs,
  });

  if (password) {
    const host = new URL(rootUrl).hostname;
    if (!loggedInHostnames.has(host)) {
      try {
        await tryLogin({ page, password });
        loggedInHostnames.add(host);
        if (logger)
          logger(`Login attempt complete on ${formatLinkForConsole(link)}`);
      } catch (e) {
        if (logger)
          logger(
            `Login attempt failed on ${formatLinkForConsole(link)}: ${String(e)}`,
          );
      }
    }
  }

  const finalRaw = page.url();
  const final = normalizeUrl({ u: finalRaw, base: rootUrl });
  let processingLink = link;
  if (final && final !== link) {
    redirects.set(link, final);
    try {
      // Increment the global redirect counter so the summary can report it.
      // Use the progress singleton wrapper to keep counters centralized.
      incRedirectsGlobally();
    } catch {
      // best-effort: don't fail page processing for metrics update
    }
    processingLink = final;
  }

  const hostname = new URL(rootUrl).hostname;
  try {
    const procHost = new URL(processingLink).hostname;
    if (procHost !== hostname) {
      if (logger)
        logger(
          `Skipping external host ${processingLink} (allowed: ${hostname})`,
        );
      processed.add(processingLink);
      if (processingLink !== link) processed.add(link);
      // Increment pages processed via singleton and mirror invariant warning.
      incPagesGlobally();
      try {
        const s = getProgressSnapshot();
        if (s.current > s.total)
          defaultLogger.warn(
            `⚠️ Progress invariant violated: current (${s.current}) > total (${s.total})`,
          );
      } catch {
        // ignore
      }
      return null;
    }
  } catch {
    // fall through
  }

  return processingLink;
}

export async function extractAndProcessPage(args: {
  page: Page;
  processingLink: string;
  hostname: string;
  preExtractedMap: Map<string, PreExtracted>;
  pendingImageRecords: Array<{
    pageUrl: string;
    original_url: ImagesType["original_url"];
    storage_path: ImagesType["storage_path"];
  }>;
  storage: ReturnType<
    typeof import("@/utils/common/supabaseClients").getClient
  >["storage"];
  overallProgress: OverallProgress;
  allExistingImageUrls: Set<string>;
  logProgress: (s1: string, s2: string) => void;
  checkProgressInvariant: (p: OverallProgress, ctx: string) => void;
}): Promise<{
  pageUpsert: { url: string; title: string; content: string };
  processedPageEntry: {
    url: string;
    title: string;
    content: string;
    images: Array<{ src: string; alt: string }>;
  };
  imgStats: {
    processed: number;
    uploaded: number;
    skipped: number;
    failed: number;
  };
  returnedPageLinks: string[];
  originalPageLinks: string[];
  retNorm: Array<{ src: string; alt: string }>;
  retSupported: Array<{ src: string; alt: string }>;
}> {
  const {
    page,
    processingLink,
    hostname,
    preExtractedMap,
    pendingImageRecords,
    storage,
    overallProgress,
    allExistingImageUrls,
    logProgress,
    checkProgressInvariant,
  } = args;

  let title: string;
  let content: string;
  let supportedImages: ExtractedImage[];
  let normalizedImages: Array<{ src: string; alt: string }>;
  let pageLinks: string[];

  if (preExtractedMap && preExtractedMap.has(processingLink)) {
    const e = preExtractedMap.get(processingLink)!;
    title = e.title;
    content = e.content;
    supportedImages = e.supportedImages || [];
    normalizedImages = e.normalizedImages || [];
    pageLinks = e.pageLinks || [];
  } else {
    type ExtractResult = {
      pageLinks: string[];
      normalizedImages: ExtractedImage[];
      supportedImages: ExtractedImage[];
      title: string;
      content: string;
    };
    const fallback: ExtractResult = {
      pageLinks: [],
      normalizedImages: [],
      supportedImages: [],
      title: "",
      content: "",
    };
    let extracted: ExtractResult = fallback;
    try {
      extracted = (await extractPageData({
        page,
        pageUrl: processingLink,
        allowedHostname: hostname,
      })) as ExtractResult;
    } catch {
      extracted = fallback;
    }
    title = extracted.title;
    content = extracted.content;
    supportedImages = extracted.supportedImages || [];
    normalizedImages = extracted.normalizedImages || [];
    pageLinks = extracted.pageLinks || [];
  }

  if (supportedImages.length > 0) {
    // Reserve slots in the singleton progress service
    reserveGlobally(supportedImages.length, "reserve images for page-v2");
    try {
      const s = getProgressSnapshot();
      if (s.current > s.total)
        checkProgressInvariant(
          { current: s.current, total: s.total } as unknown as OverallProgress,
          "reserve images for page-v2",
        );
    } catch {
      // ignore
    }
    try {
      logProgress(
        "📷",
        `Reserved ${supportedImages.length} images for ${formatPathForConsole(processingLink)} (+${supportedImages.length})`,
      );
    } catch {
      // best-effort
    }
  }

  const {
    pageUpsert,
    processedPageEntry,
    imgStats,
    pageLinks: returnedPageLinks,
    normalizedImages: retNorm,
    supportedImages: retSupported,
  } = await processPageAndImages({
    page,
    link: processingLink,
    allowedHostname: hostname,
    storage,
    overallProgress,
    allExistingImageUrls,
    pendingImageRecords,
    logProgress,
    shouldCancel: undefined,
    checkProgressInvariant: (p: OverallProgress, ctx: string) =>
      checkProgressInvariant(p, ctx),
    preExtracted: {
      title,
      content,
      supportedImages,
      normalizedImages,
      pageLinks,
    },
  });

  return {
    pageUpsert,
    processedPageEntry,
    imgStats,
    returnedPageLinks,
    originalPageLinks: pageLinks,
    retNorm,
    retSupported,
  };
}

export function postProcessPageResults(args: {
  pageUpsert: { url: string; title: string; content: string };
  processedPageEntry: {
    url: string;
    title: string;
    content: string;
    images: Array<{ src: string; alt: string }>;
  };
  imgStats: {
    processed: number;
    uploaded: number;
    skipped: number;
    failed: number;
  };
  returnedPageLinks: string[];
  originalPageLinks: string[];
  retNorm: Array<{ src: string; alt: string }>;
  retSupported: Array<{ src: string; alt: string }>;
  processingLink: string;
  rootUrl: string;
  hostname: string;
  restrictToSeeds: boolean;
  enqueueLinks: (links: string[]) => number;
  formatLinkForConsole: (u: string) => string;
  logProgress: (s1: string, s2: string) => void;
  pagesToUpsert: Array<Pick<PagesType, "url" | "title" | "content">>;
  processedPages: Array<Record<string, unknown>>;
  imagesStats: {
    processed: number;
    uploaded: number;
    skipped: number;
    failed: number;
  };
  uniqueAllImageUrls: Set<string>;
  uniqueAllowedImageUrls: Set<string>;
  uniqueUnsupportedImageUrls: Set<string>;
  // allExistingImageUrls not required here
  progress: OverallProgress;
  processed: Set<string>;
}): void {
  const {
    pageUpsert,
    processedPageEntry,
    imgStats,
    returnedPageLinks,
    originalPageLinks,
    retNorm,
    retSupported,
    processingLink,
    rootUrl,
    hostname,
    restrictToSeeds,
    enqueueLinks,
    formatLinkForConsole,
    logProgress,
    pagesToUpsert,
    processedPages,
    imagesStats,
    uniqueAllImageUrls,
    uniqueAllowedImageUrls,
    uniqueUnsupportedImageUrls,
    processed,
  } = args;

  const rawLinks = returnedPageLinks || originalPageLinks || [];
  const allowed = rawLinks
    .map((h) => normalizeUrl({ u: h, base: rootUrl }))
    .filter((h) => {
      try {
        return new URL(h).hostname === hostname;
      } catch {
        return false;
      }
    });
  if (!restrictToSeeds) {
    const added = enqueueLinks(allowed);
    logProgress(
      "🔗",
      `Discovered ${allowed.length} links on ${formatLinkForConsole(processingLink)}${added ? ` (+${added})` : ""}`,
    );
  } else {
    logProgress(
      "🔗",
      `Discovered ${allowed.length} links on ${formatLinkForConsole(processingLink)}`,
    );
  }

  updateImageSets(
    uniqueAllImageUrls,
    uniqueAllowedImageUrls,
    uniqueUnsupportedImageUrls,
    retNorm,
    retSupported,
  );

  pagesToUpsert.push(pageUpsert);
  processedPages.push(processedPageEntry);
  imagesStats.processed += imgStats.processed || 0;
  imagesStats.uploaded += imgStats.uploaded || 0;
  imagesStats.skipped += imgStats.skipped || 0;
  imagesStats.failed += imgStats.failed || 0;

  incPagesGlobally();
  try {
    const s = getProgressSnapshot();
    if (s.current > s.total)
      defaultLogger.warn(
        `⚠️ Progress invariant violated: current (${s.current}) > total (${s.total})`,
      );
  } catch {
    // ignore
  }
  processed.add(processingLink);
  if (processingLink !== pageUpsert.url) processed.add(pageUpsert.url);
  logProgress("✅", `Processed ${formatLinkForConsole(processingLink)}`);
}

export function updateImageSets(
  uniqueAllImageUrls: Set<string>,
  uniqueAllowedImageUrls: Set<string>,
  uniqueUnsupportedImageUrls: Set<string>,
  retNorm: Array<{ src: string; alt: string }> | undefined,
  retSupported: Array<{ src: string; alt: string }> | undefined,
): void {
  for (const img of retNorm || []) uniqueAllImageUrls.add(img.src);
  for (const img of retNorm || []) {
    if ((retSupported || []).find((s: { src: string }) => s.src === img.src))
      uniqueAllowedImageUrls.add(img.src);
    else uniqueUnsupportedImageUrls.add(img.src);
  }
}

export async function processLinkForWorker(args: {
  page: Page;
  link: string;
  rootUrl: string;
  password?: string;
  logger?: (s: string) => void;
  preExtractedMap: Map<string, PreExtracted>;
  pendingImageRecords: Array<{
    pageUrl: string;
    original_url: ImagesType["original_url"];
    storage_path: ImagesType["storage_path"];
  }>;
  pagesToUpsert: Array<Pick<PagesType, "url" | "title" | "content">>;
  processedPages: Array<Record<string, unknown>>;
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
  logProgress: (s1: string, s2: string) => void;
  progress: OverallProgress;
  checkProgressInvariant: (p: OverallProgress, ctx: string) => void;
}): Promise<void> {
  const {
    page,
    link,
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
    formatLinkForConsole,
    logProgress,
    progress,
    checkProgressInvariant,
  } = args;

  const processingLink = await navigateAndResolveProcessingLink({
    page,
    link,
    rootUrl,
    password,
    logger,
    loggedInHostnames,
    redirects,
    processed,
    formatLinkForConsole,
    progress,
  });
  if (!processingLink) return;

  const hostname = new URL(rootUrl).hostname;

  const { storage } = (
    await import("@/utils/common/supabaseClients")
  ).getClient();

  const {
    pageUpsert,
    processedPageEntry,
    imgStats,
    returnedPageLinks,
    originalPageLinks,
    retNorm,
    retSupported,
  } = await extractAndProcessPage({
    page,
    processingLink,
    hostname,
    preExtractedMap,
    pendingImageRecords,
    storage,
    overallProgress: progress,
    allExistingImageUrls,
    logProgress,
    checkProgressInvariant,
  });

  postProcessPageResults({
    pageUpsert,
    processedPageEntry,
    imgStats,
    returnedPageLinks,
    originalPageLinks,
    retNorm,
    retSupported,
    processingLink,
    rootUrl,
    hostname,
    restrictToSeeds,
    enqueueLinks,
    formatLinkForConsole,
    logProgress,
    pagesToUpsert,
    processedPages,
    imagesStats,
    uniqueAllImageUrls,
    uniqueAllowedImageUrls,
    uniqueUnsupportedImageUrls,
    progress,
    processed,
  });
}

export async function loadExistingImageUrls(
  db: unknown,
  logger?: (s: string) => void,
): Promise<Set<string>> {
  try {
    // db may be undefined in some test harnesses; guard accordingly
    if (!db) return new Set();
    // Extract DB fetch to helper for readability and testability
    const allExistingImages = await (async function fetchAllImageRows() {
      if (typeof db !== "object" || db === null) return undefined;
      const fromProp = Reflect.get(db, "from");
      if (typeof fromProp !== "function") return undefined;
      const fromFn = fromProp as (table: string) => unknown;
      const fromCall = fromFn.call(db as object, "images") as unknown;
      const selectFn = Reflect.get(fromCall as object, "select");
      if (!fromCall || typeof selectFn !== "function") return undefined;
      const res = await (selectFn as (s: string) => Promise<unknown>).call(
        fromCall,
        "original_url",
      );
      if (res && typeof res === "object" && "data" in res) {
        return (res as { data?: unknown }).data;
      }
      return res;
    })();
    const existingArray = Array.isArray(allExistingImages)
      ? allExistingImages.filter((r: unknown) => typeof r === "object")
      : [];
    const set = new Set<string>();
    for (const img of existingArray) {
      try {
        const original = Reflect.get(img as object, "original_url");
        let normalizedUrl = typeof original === "string" ? original : "";
        const u = new URL(normalizedUrl);
        normalizedUrl = `${u.protocol}//${u.hostname}${u.pathname}`;
        set.add(normalizedUrl);
      } catch (e) {
        defaultLogger.debug("normalize URL failed:", e);
      }
    }
    if (logger) logger(`Found ${set.size} existing images in database`);
    return set;
  } catch (e) {
    const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
    if (logger) logger(`Failed to load existing images: ${msg}`);
    defaultLogger.debug("loadExistingImageUrls error:", e);
    return new Set<string>();
  }
}

type PerformArgs = {
  pagesToUpsert: Array<Record<string, unknown>>;
  pendingImageRecords: Array<Record<string, unknown>>;
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
  dryRun?: boolean;
};

export async function performBulkUpsertSummary(
  args: PerformArgs,
): Promise<string[] | undefined> {
  const {
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
    dryRun,
  } = args;

  try {
    const { client: dbClient } = getClient();
    const normalizedPages = pagesToUpsert.map((p) => ({
      url: String(p.url),
      title: typeof p.title === "string" ? p.title : "",
      content: typeof p.content === "string" ? p.content : null,
    }));
    const normalizedPending = pendingImageRecords.map((r) => ({
      pageUrl: String(r.pageUrl),
      original_url: String(r.original_url),
      storage_path: String(r.storage_path),
    }));
    const res = await bulkUpsertPagesAndImages({
      db: dbClient!,
      pagesToUpsert: normalizedPages,
      pendingImageRecords: normalizedPending,
      uniqueAllowedImageUrls,
      uniqueAllImageUrls,
      uniqueUnsupportedImageUrls,
      allExistingImageUrls,
      imagesStats,
      pagesFailed,
      providedCount,
      dryRun: dryRun || false,
    });
    if (res.lines && res.lines.length) printSummaryLines(res.lines, logger);
    return res.lines;
  } catch (e) {
    defaultLogger.warn("V2 bulkUpsert failed:", e);
    // Try a dry run summary attempt
    try {
      const { client: dbClient } = getClient();
      const normalizedPages = pagesToUpsert.map((p) => ({
        url: String(p.url),
        title: typeof p.title === "string" ? p.title : "",
        content: typeof p.content === "string" ? p.content : null,
      }));
      const normalizedPending = pendingImageRecords.map((r) => ({
        pageUrl: String(r.pageUrl),
        original_url: String(r.original_url),
        storage_path: String(r.storage_path),
      }));
      const res = await bulkUpsertPagesAndImages({
        db: dbClient!,
        pagesToUpsert: normalizedPages,
        pendingImageRecords: normalizedPending,
        uniqueAllowedImageUrls,
        uniqueAllImageUrls,
        uniqueUnsupportedImageUrls,
        allExistingImageUrls,
        imagesStats,
        pagesFailed,
        providedCount,
        dryRun: true,
      });
      if (res.lines && res.lines.length) printSummaryLines(res.lines, logger);
      return res.lines;
    } catch {
      const uniquePageMap = new Map<string, (typeof pagesToUpsert)[number]>();
      for (const p of pagesToUpsert) uniquePageMap.set(String(p.url), p);
      const totalUniquePages = uniquePageMap.size;
      const providedCountVal = providedCount;
      const insertedCountVal = totalUniquePages;
      const updatedCountVal = 0;
      const skippedCountVal =
        providedCountVal > 0
          ? Math.max(0, providedCountVal - totalUniquePages)
          : 0;

      const params: SummaryParams = {
        providedCount: providedCountVal,
        pagesAnalyzed:
          providedCountVal > 0 ? providedCountVal : totalUniquePages,
        pagesRedirected: getProgressSnapshot().pagesRedirected || 0,
        imagesProcessed: getProgressSnapshot().imagesProcessed || 0,
        insertedCount: insertedCountVal,
        updatedCount: updatedCountVal,
        skippedCount: skippedCountVal,
        pagesFailed: pagesFailed,
        uniqueTotalImages: uniqueAllImageUrls.size,
        uniqueUnsupported: uniqueUnsupportedImageUrls.size,
        uniqueAllowed: uniqueAllowedImageUrls.size,
        imagesUploadedCount: imagesStats.uploaded,
        uniqueSkipped: Array.from(uniqueAllowedImageUrls).filter((u) =>
          allExistingImageUrls.has(u),
        ).length,
        imagesFailed: imagesStats.failed,
        imagesDbInsertedCount: pendingImageRecords.length,
        imagesAlreadyAssociatedCount: Array.from(uniqueAllowedImageUrls).filter(
          (u) => allExistingImageUrls.has(u),
        ).length,
      };
      const boxed = formatSummaryBox({ p: params });
      if (boxed && boxed.length) {
        printSummaryLines(boxed, logger);
        return boxed;
      }
      return undefined;
    }
  }
}

function printSummaryLines(
  lines: string[] | undefined,
  logger?: (s: string) => void,
): void {
  if (!lines || !lines.length) return;
  const out = lines.join("\n");
  if (logger) logger(out);
  else defaultLogger.log(out);
}

export async function logSummaryAndClose(args: {
  pagesToUpsert: Array<Record<string, unknown>>;
  pendingImageRecords: Array<Record<string, unknown>>;
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
}): Promise<{ debug: { seedUrl: string }; progress: OverallProgress }> {
  const {
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
  } = args;

  await performBulkUpsertSummary({
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
  });

  try {
    await browser.close();
  } catch (e) {
    defaultLogger.debug("Error closing browser during logSummaryAndClose:", e);
  }

  return { debug: { seedUrl: rootUrl }, progress };
}
