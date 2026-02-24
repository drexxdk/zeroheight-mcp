import defaultLogger from "@/utils/logger";
import { getClient } from "@/utils/common/supabaseClients";
import type { BulkUpsertResult } from "./bulkUpsert";
import { formatSummaryBox, bulkUpsertPagesAndImages } from "./bulkUpsert";
import type { ImagesType, PagesType } from "@/generated/database-types";
import type { OverallProgress } from "./processPageAndImages";
import type { ExtractedImage } from "./pageExtraction";
import type { SummaryParams } from "./bulkUpsertHelpers";
import type { Page, Browser } from "puppeteer";
import { tryLogin } from "@/utils/common/scraperHelpers";
import { getProp } from "@/utils/common/typeGuards";
import { extractPageData } from "./pageExtraction";
import { fetchAndExtract } from "./fetchExtractor";
import { processPageAndImages } from "./processPageAndImages";
import { normalizeUrl } from "./prefetch";
import progressService, {
  getProgressSnapshot,
  upsertItem,
  getItems,
  markImagePending,
  markImageUnsupported,
} from "@/utils/common/progress";
import { normalizeImageUrl } from "./imageHelpers";
import { config } from "@/utils/config";

type PreExtracted = {
  title: string;
  content: string;
  supportedImages: ExtractedImage[];
  normalizedImages: Array<{ src: string; alt: string }>;
  pageLinks: string[];
};

// Simple in-memory cache mapping hostname -> serialized cookie header
const COOKIE_CACHE = new Map<string, string>();

export function formatPathForConsole(u: string): string {
  try {
    const parsed = new URL(u);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return u;
  }
}

async function tryLoginIfNeeded(opts: {
  page: Page;
  rootUrl: string;
  password?: string;
  logger?: (s: string) => void;
  loggedInHostnames: Set<string>;
  formatLinkForConsole: (u: string) => string;
  link: string;
}): Promise<void> {
  const {
    page,
    rootUrl,
    password,
    logger,
    loggedInHostnames,
    formatLinkForConsole,
    link,
  } = opts;
  if (!password) return;
  const host = new URL(rootUrl).hostname;
  if (loggedInHostnames.has(host)) return;
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

function recordRedirectItem(
  link: string,
  final: string,
  redirects: Map<string, string>,
): void {
  redirects.set(link, final);
  try {
    upsertItem({
      url: link,
      type: "page",
      status: "redirected",
      finalUrl: final,
    });
  } catch {
    try {
      progressService.incRedirects(1);
    } catch {
      // best-effort
    }
  }
}

function markPagesExternal(
  processingLink: string,
  link: string,
  hostname: string,
  logger: ((s: string) => void) | undefined,
  processed: Set<string>,
): void {
  if (logger)
    logger(`Skipping external host ${processingLink} (allowed: ${hostname})`);
  processed.add(processingLink);
  if (processingLink !== link) processed.add(link);
  try {
    upsertItem({ url: processingLink, type: "page", status: "external" });
    if (processingLink !== link)
      upsertItem({ url: link, type: "page", status: "external" });
  } catch {
    try {
      progressService.incPages(1);
    } catch {
      // ignore
    }
  }
  try {
    const s = getProgressSnapshot();
    if (s.current > s.total)
      defaultLogger.warn(
        `⚠️ Progress invariant violated: current (${s.current}) > total (${s.total})`,
      );
  } catch {
    // ignore
  }
}

export async function navigateAndResolveProcessingLink(args: {
  page: Page;
  link: string;
  rootUrl: string;
  password?: string;
  logger?: (s: string) => void;
  logProgress?: (icon: string, msg: string) => void;
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

  const _navStart = Date.now();
  await page.goto(link, {
    waitUntil: config.scraper.viewport.navWaitUntil,
    timeout: config.scraper.viewport.navTimeoutMs,
  });
  try {
    const navMs = Date.now() - _navStart;
    // Prefer the progress-aware logger when available so messages include
    // the progress bar and current/total counts; fall back to the job logger.
    const navMsg = `Navigation to ${formatLinkForConsole(link)} completed in ${navMs}ms`;
    if (args.logProgress) args.logProgress("⏱️", navMsg);
    else if (logger) logger(navMsg);
  } catch {
    // ignore
  }

  await tryLoginIfNeeded({
    page,
    rootUrl,
    password,
    logger,
    loggedInHostnames,
    formatLinkForConsole,
    link,
  });

  const finalRaw = page.url();
  const final = normalizeUrl({ u: finalRaw, base: rootUrl });
  let processingLink = link;
  if (final && final !== link) {
    recordRedirectItem(link, final, redirects);
    processingLink = final;
  }

  const hostname = new URL(rootUrl).hostname;
  try {
    const procHost = new URL(processingLink).hostname;
    if (procHost !== hostname) {
      markPagesExternal(processingLink, link, hostname, logger, processed);
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
  cookieHeader?: string;
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
  // Gather extraction data (title/content/images/links). Split into helper
  // so this function remains small and focused.
  const { title, content, supportedImages, normalizedImages, pageLinks } =
    await (async function performExtraction(): Promise<{
      title: string;
      content: string;
      supportedImages: ExtractedImage[];
      normalizedImages: Array<{ src: string; alt: string }>;
      pageLinks: string[];
    }> {
      if (preExtractedMap && preExtractedMap.has(processingLink)) {
        const e = preExtractedMap.get(processingLink)!;
        return {
          title: e.title,
          content: e.content,
          supportedImages: e.supportedImages || [],
          normalizedImages: e.normalizedImages || [],
          pageLinks: e.pageLinks || [],
        };
      }

      const fallback = {
        pageLinks: [] as string[],
        normalizedImages: [] as ExtractedImage[],
        supportedImages: [] as ExtractedImage[],
        title: "",
        content: "",
      };

      type ExtractResult = typeof fallback;

      try {
        if (args.cookieHeader) {
          try {
            const f = await fetchAndExtract({
              url: processingLink,
              cookieHeader: args.cookieHeader,
              allowedHostname: hostname,
            });
            return {
              title: f.title,
              content: f.content,
              supportedImages: f.supportedImages as ExtractedImage[],
              normalizedImages: f.normalizedImages as ExtractedImage[],
              pageLinks: f.pageLinks,
            } as ExtractResult;
          } catch (_e) {
            try {
              const extracted = (await extractPageData({
                page,
                pageUrl: processingLink,
                allowedHostname: hostname,
              })) as ExtractResult;
              return extracted;
            } catch {
              return fallback;
            }
          }
        }
        const extracted = (await extractPageData({
          page,
          pageUrl: processingLink,
          allowedHostname: hostname,
        })) as ExtractResult;
        return extracted;
      } catch {
        return fallback;
      }
    })();

  if (supportedImages.length > 0) {
    await (async function reserveImageItems(): Promise<void> {
      try {
        for (const img of supportedImages) {
          try {
            const normalized = normalizeImageUrl({ src: img.src });
            upsertItem({ url: normalized, type: "image", status: "pending" });
          } catch {
            upsertItem({
              url: String(img.src || ""),
              type: "image",
              status: "pending",
            });
          }
        }
      } catch {
        try {
          progressService.reserve(supportedImages.length, undefined);
        } catch {
          // ignore
        }
      }
      try {
        const s = getProgressSnapshot();
        if (s.current > s.total)
          checkProgressInvariant(
            {
              current: s.current,
              total: s.total,
            } as unknown as OverallProgress,
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
    })();
  }

  // time the page+image processing to identify hotspots
  const _procStart = Date.now();
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
  try {
    const procMs = Date.now() - _procStart;
    try {
      logProgress("⏱️", `Processed ${processingLink} in ${procMs}ms`);
    } catch {
      // best-effort
    }
  } catch {
    // ignore
  }

  return {
    pageUpsert,
    processedPageEntry,
    imgStats,
    // imgStats intentionally not used here; callers handle image progress
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
  // image sets removed - progress items are the source of truth
  // allExistingImageUrls not required here
  progress: OverallProgress;
  processed: Set<string>;
}): void {
  const {
    pageUpsert,
    processedPageEntry,
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
    // removed
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
  (function reportDiscoveredLinks() {
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
  })();

  // Image sets are now derived from progress items; individual images
  // were recorded above with `upsertItem`, so no runtime set updates
  // are required here.

  pagesToUpsert.push(pageUpsert);
  processedPages.push(processedPageEntry);
  // Image counters (processed/uploaded/skipped/failed) are derived from
  // the progress items at finalization. Do not update a local `imagesStats` here.

  // Upsert the page item as processed
  try {
    upsertItem({ url: processingLink, type: "page", status: "processed" });
  } catch {
    try {
      progressService.incPages(1);
    } catch {
      // ignore
    }
  }
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

  // Record discovered images as progress items so summaries can be derived
  // from the progress service. Mark supported images as pending so they
  // will be counted when processed; mark unsupported images as skipped.
  (function recordDiscoveredImages() {
    try {
      const supportedSet = new Set((retSupported || []).map((s) => s.src));
      for (const img of retNorm || []) {
        try {
          // Normalize discovered image URLs so that later processing and
          // upload code operate on the same canonical form used by the
          // ProgressService. This prevents mismatches where pending items
          // and uploaded items use different keys.
          let key = String(img.src || "");
          try {
            key = normalizeImageUrl({ src: img.src });
          } catch {
            // fall back to raw src on normalization failure
            key = String(img.src || "");
          }
          if (supportedSet.has(img.src)) {
            try {
              markImagePending(key);
            } catch {
              // best-effort
            }
          } else {
            try {
              markImageUnsupported(key);
            } catch {
              // best-effort
            }
          }
        } catch {
          // best-effort
        }
      }
    } catch {
      // best-effort
    }
  })();
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
  // image sets removed - compute categories from progress items instead
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
    // imagesStats removed; derive final image counters from progress items
    // removed
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
    logProgress,
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
  // Determine cookie header for fetch-based extractor when we have a project
  // password. Cache per-hostname to avoid repeating the login flow.
  let cookieHeader: string | undefined;
  try {
    if (password) {
      const host = new URL(rootUrl).hostname;
      if (COOKIE_CACHE.has(host)) cookieHeader = COOKIE_CACHE.get(host);
      else {
        try {
          // Import helper that knows how to perform login and serialize cookies
          const { getAuthenticatedCookieHeader } = await import("./puppeteer");
          const browser = (
            page as unknown as { browser?: () => Browser }
          ).browser?.();
          if (browser && typeof getAuthenticatedCookieHeader === "function") {
            const ch = await getAuthenticatedCookieHeader({
              browser,
              url: rootUrl,
              password,
            });
            if (ch) {
              COOKIE_CACHE.set(host, ch);
              cookieHeader = ch;
            }
          }
        } catch (_e) {
          // best-effort: continue without cookieHeader
        }
      }
    }
  } catch {
    // ignore
  }

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
    cookieHeader,
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
  runDurationMs?: number;
};

export async function performBulkUpsertSummary(
  args: PerformArgs,
): Promise<string[] | undefined> {
  const {
    pagesToUpsert,
    pendingImageRecords,
    // prefer provided sets but derive from progress if not available
    uniqueAllowedImageUrls: _uniqueAllowedImageUrls,
    uniqueAllImageUrls: _uniqueAllImageUrls,
    uniqueUnsupportedImageUrls: _uniqueUnsupportedImageUrls,
    allExistingImageUrls,
    imagesStats,
    pagesFailed,
    providedCount,
    logger,
    dryRun,
  } = args;

  // Derive image sets from the progress items so the progress service
  // remains the single source of truth. If callers supplied sets, prefer
  // them, otherwise use derived sets.
  const items = getItems();
  const imageItems = items.filter((it) => it.type === "image");
  const derivedUniqueAll = new Set(imageItems.map((i) => i.url));
  const derivedUniqueAllowed = new Set(
    imageItems.filter((i) => i.reason === "supported").map((i) => i.url),
  );
  const derivedUniqueUnsupported = new Set(
    imageItems.filter((i) => i.reason === "unsupported").map((i) => i.url),
  );

  const uniqueAll = _uniqueAllImageUrls ?? derivedUniqueAll;
  const uniqueAllowed = _uniqueAllowedImageUrls ?? derivedUniqueAllowed;
  const uniqueUnsupported =
    _uniqueUnsupportedImageUrls ?? derivedUniqueUnsupported;

  // Normalize inputs
  const normalizeInputs = (): {
    normalizedPages: Array<{
      url: string;
      title: string;
      content: string | null;
    }>;
    normalizedPending: Array<{
      pageUrl: string;
      original_url: string;
      storage_path: string;
    }>;
  } => {
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
    return { normalizedPages, normalizedPending };
  };

  const tryCallBulk = async (dry: boolean): Promise<BulkUpsertResult> => {
    const { client: dbClient } = getClient();
    const { normalizedPages, normalizedPending } = normalizeInputs();
    return await bulkUpsertPagesAndImages({
      db: dbClient!,
      pagesToUpsert: normalizedPages,
      pendingImageRecords: normalizedPending,
      uniqueAllowedImageUrls: uniqueAllowed,
      uniqueAllImageUrls: uniqueAll,
      uniqueUnsupportedImageUrls: uniqueUnsupported,
      allExistingImageUrls,
      imagesStats,
      pagesFailed,
      providedCount,
      dryRun: dry,
      runDurationMs: args.runDurationMs,
    });
  };

  try {
    const res = await tryCallBulk(!!dryRun);
    if (res.lines && res.lines.length) printSummaryLines(res.lines, logger);
    return res.lines;
  } catch (e) {
    defaultLogger.warn("V2 bulkUpsert failed:", e);
  }
  // Try a dry run summary attempt
  try {
    const res = await tryCallBulk(true);
    if (res.lines && res.lines.length) printSummaryLines(res.lines, logger);
    return res.lines;
  } catch {
    const { normalizedPages, normalizedPending } = normalizeInputs();
    return computeFallbackSummary({
      pagesToUpsert: normalizedPages,
      pendingImageRecords: normalizedPending,
      uniqueAll,
      uniqueAllowed,
      uniqueUnsupported,
      allExistingImageUrls,
      imagesStats,
      pagesFailed,
      providedCount,
      logger,
    });
  }
}

function computeFallbackSummary(args: {
  pagesToUpsert: Array<Pick<PagesType, "url" | "title" | "content">>;
  pendingImageRecords: Array<{
    pageUrl: string;
    original_url: string;
    storage_path: string;
  }>;
  uniqueAll: Set<string>;
  uniqueAllowed: Set<string>;
  uniqueUnsupported: Set<string>;
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
  runDurationMs?: number;
}): string[] | undefined {
  const {
    pagesToUpsert,
    pendingImageRecords,
    uniqueAll,
    uniqueAllowed,
    uniqueUnsupported,
    allExistingImageUrls,
    // imagesStats intentionally not used here; callers handle image progress
    pagesFailed,
    providedCount,
    logger,
  } = args;

  const uniquePageMap = new Map<string, (typeof pagesToUpsert)[number]>();
  for (const p of pagesToUpsert) uniquePageMap.set(String(p.url), p);
  const totalUniquePages = uniquePageMap.size;
  const providedCountVal = providedCount;
  const insertedCountVal = totalUniquePages;
  const updatedCountVal = 0;
  const skippedCountVal =
    providedCountVal > 0 ? Math.max(0, providedCountVal - totalUniquePages) : 0;

  const derivedUniqueTotalImages = uniqueAll.size;

  const uniqueAllowedCount =
    uniqueAllowed && uniqueAllowed.size > 0
      ? uniqueAllowed.size
      : getItems()
          .filter((i) => i.type === "image" && i.status === "processed")
          .map((i) => i.url)
          .filter((v, idx, arr) => arr.indexOf(v) === idx).length;

  const uniqueUnsupportedCount =
    uniqueUnsupported && uniqueUnsupported.size > 0
      ? uniqueUnsupported.size
      : Math.max(0, derivedUniqueTotalImages - uniqueAllowedCount);

  // Derive precise image outcome counts from the progress items so the
  // summary is authoritative and not dependent on local image counters.
  const items = getItems();
  const imageItems = items.filter((i) => i.type === "image");
  const uploadedCount = imageItems.filter(
    (i) => i.reason === "uploaded",
  ).length;
  const skippedUniqueCount = Array.from(
    new Set(
      imageItems
        .filter(
          (i) => i.reason === "already_present" || i.reason === "duplicate",
        )
        .map((i) => i.url),
    ),
  ).length;
  const failedCount = imageItems.filter((i) => {
    // Treat known non-failure reasons as non-failures; everything else is a failure
    const r = i.reason || "";
    return (
      r !== "uploaded" &&
      r !== "already_present" &&
      r !== "duplicate" &&
      r !== "unsupported" &&
      r !== "invalid"
    );
  }).length;

  const params: SummaryParams = {
    providedCount: providedCountVal,
    pagesAnalyzed: providedCountVal > 0 ? providedCountVal : totalUniquePages,
    pagesRedirected: getProgressSnapshot().pagesRedirected || 0,
    imagesProcessed: getProgressSnapshot().imagesProcessed || 0,
    insertedCount: insertedCountVal,
    updatedCount: updatedCountVal,
    skippedCount: skippedCountVal,
    pagesFailed: pagesFailed,
    uniqueTotalImages: derivedUniqueTotalImages,
    uniqueUnsupported: uniqueUnsupportedCount,
    uniqueAllowed: uniqueAllowedCount,
    imagesUploadedCount: uploadedCount,
    uniqueSkipped: skippedUniqueCount,
    imagesFailed: failedCount,
    imagesDbInsertedCount: pendingImageRecords.length,
    imagesAlreadyAssociatedCount: Array.from(uniqueAllowed).filter((u) =>
      allExistingImageUrls.has(u),
    ).length,
    // include runtime when available so boxed summary can show it
    runtimeMs: args.runDurationMs,
  };
  const boxed = formatSummaryBox({ p: params });
  if (boxed && boxed.length) {
    printSummaryLines(boxed, logger);
    return boxed;
  }
  return undefined;
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
  runDurationMs?: number;
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

  const normalizedPages = pagesToUpsert.map((p) => ({
    url:
      typeof getProp(p, "url") === "string"
        ? String(getProp(p, "url"))
        : String(p.url ?? ""),
    title:
      typeof getProp(p, "title") === "string"
        ? String(getProp(p, "title"))
        : "",
    content:
      typeof getProp(p, "content") === "string"
        ? String(getProp(p, "content"))
        : null,
  }));
  const normalizedPending = pendingImageRecords.map((r) => ({
    pageUrl:
      typeof getProp(r, "pageUrl") === "string"
        ? String(getProp(r, "pageUrl"))
        : String(getProp(r, "pageUrl") ?? ""),
    original_url:
      typeof getProp(r, "original_url") === "string"
        ? String(getProp(r, "original_url"))
        : String(getProp(r, "original_url") ?? ""),
    storage_path:
      typeof getProp(r, "storage_path") === "string"
        ? String(getProp(r, "storage_path"))
        : String(getProp(r, "storage_path") ?? ""),
  }));

  await performBulkUpsertSummary({
    pagesToUpsert: normalizedPages,
    pendingImageRecords: normalizedPending,
    uniqueAllowedImageUrls,
    uniqueAllImageUrls,
    uniqueUnsupportedImageUrls,
    allExistingImageUrls,
    imagesStats,
    pagesFailed,
    providedCount,
    logger,
    runDurationMs: args.runDurationMs,
  });

  try {
    await browser.close();
  } catch (e) {
    defaultLogger.debug("Error closing browser during logSummaryAndClose:", e);
  }

  return { debug: { seedUrl: rootUrl }, progress };
}
