import { z } from "zod";
import type { Page } from "puppeteer";
import { launchBrowser, attachDefaultInterception } from "./utils/puppeteer";
import {
  createSuccessResponse,
  createErrorResponse,
} from "@/utils/toolResponses";
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
import { processPageAndImages } from "./utils/processPageAndImages";
import prefetchSeeds, { normalizeUrl } from "./utils/prefetch";
import { SCRAPER_DEBUG } from "@/utils/config";
import {
  SCRAPER_CONCURRENCY,
  SCRAPER_IDLE_TIMEOUT_MS,
  SCRAPER_SEED_PREFETCH_CONCURRENCY,
  ZEROHEIGHT_PROJECT_URL,
} from "@/utils/config";
import {
  SCRAPER_VIEWPORT_WIDTH,
  SCRAPER_VIEWPORT_HEIGHT,
  SCRAPER_NAV_WAITUNTIL,
  SCRAPER_NAV_TIMEOUT_MS,
  SCRAPER_MONITOR_POLL_MS,
  SCRAPER_MONITOR_IDLE_POLL_MS,
} from "@/utils/config";
import {
  bulkUpsertPagesAndImages,
  formatSummaryBox,
  SummaryParams,
} from "./utils/bulkUpsert";
import {
  createJobInDb,
  appendJobLog,
  finishJob,
  getJobFromDb,
} from "../tasks/utils/jobStore";
import { tryLogin } from "@/utils/common/scraperHelpers";
import { isRecord } from "@/utils/common/typeGuards";

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
}) {
  try {
    const concurrency = SCRAPER_CONCURRENCY;
    const idleTimeout = SCRAPER_IDLE_TIMEOUT_MS;
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

    const processedPages: Array<{
      url: PagesType["url"];
      title: PagesType["title"];
      content: PagesType["content"];
      images: Array<{ src: string; alt: string }>;
    }> = [];

    type PreExtracted = {
      title: string;
      content: string;
      supportedImages: ExtractedImage[];
      normalizedImages: Array<{ src: string; alt: string }>;
      pageLinks: string[];
    };

    const preExtractedMap: Map<string, PreExtracted> = new Map();

    const waiters: Array<(val: string | null) => void> = [];

    function formatLinkForConsole(u: string) {
      try {
        const parsed = new URL(u);
        return `${parsed.pathname}${parsed.search}` || "/";
      } catch {
        return u;
      }
    }

    function enqueueLinks(links: string[]) {
      const added: string[] = [];
      for (const l of links) {
        const effective = redirects.get(l) ?? l;
        if (!processed.has(effective) && !inQueue.has(effective)) {
          inQueue.add(effective);
          queue.push(effective);
          added.push(effective);
        }
      }
      if (added.length) {
        progress.total += added.length;
        lastActivity = Date.now();
        while (waiters.length && queue.length) {
          const w = waiters.shift()!;
          const item = queue.shift()!;
          inQueue.delete(item);
          inProgressCount++;
          progress.current++;
          w(item);
        }
      }
    }
    function getNextLink(): Promise<string | null> {
      if (queue.length > 0) {
        const item = queue.shift()!;
        inQueue.delete(item);
        inProgressCount++;
        progress.current++;
        return Promise.resolve(item);
      }
      return new Promise((res) => waiters.push(res));
    }
    const { logProgress } = createProgressHelpers({
      progress,
      checkProgressInvariant,
      logger,
    });

    const restrictToSeeds = !!(pageUrls && pageUrls.length > 0);

    const { client: db } = getClient();
    const imagesTable = "images" as const;
    const loggedInHostnames = new Set<string>();
    let allExistingImageUrls = new Set<string>();
    try {
      const { data: allExistingImages } = await db!
        .from(imagesTable)
        .select("original_url");
      allExistingImageUrls = new Set(
        (allExistingImages || []).map((img: Record<string, unknown>) => {
          let normalizedUrl = "";
          const original = img["original_url"];
          if (typeof original === "string") normalizedUrl = original;
          try {
            const u = new URL(normalizedUrl);
            normalizedUrl = `${u.protocol}//${u.hostname}${u.pathname}`;
          } catch {}
          return normalizedUrl;
        }),
      );
      if (logger)
        logger(
          `Found ${allExistingImageUrls.size} existing images in database`,
        );
    } catch (e) {
      if (logger) logger(`Failed to load existing images: ${String(e)}`);
      allExistingImageUrls = new Set<string>();
    }

    if (pageUrls && pageUrls.length > 0) {
      const normalized = pageUrls.map((p) =>
        normalizeUrl({ u: p, base: rootUrl }),
      );
      const { preExtractedMap: seedMap } = await prefetchSeeds({
        browser,
        rootUrl,
        seeds: normalized,
        password,
        concurrency: SCRAPER_SEED_PREFETCH_CONCURRENCY,
        logger,
      });

      for (const [k, v] of seedMap) preExtractedMap.set(k, v as PreExtracted);

      // If we provided a password and prefetchSeeds ran, assume we've logged
      // into the project hostname so workers don't repeatedly try to login.
      if (password) loggedInHostnames.add(new URL(rootUrl).hostname);

      enqueueLinks(normalized);
      logProgress("⚑", `Seeded ${normalized.length} initial links`);
    } else {
      const p = await browser.newPage();
      await p.setViewport({
        width: SCRAPER_VIEWPORT_WIDTH,
        height: SCRAPER_VIEWPORT_HEIGHT,
      });
      // attach default interception rules (blocks fonts/styles/ext images etc.)
      try {
        await attachDefaultInterception(p).catch(() => {});
      } catch {}
      await p.goto(rootUrl, {
        waitUntil: SCRAPER_NAV_WAITUNTIL,
        timeout: SCRAPER_NAV_TIMEOUT_MS,
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
      const extracted = await extractPageData({
        page: p,
        pageUrl: rootUrl,
        allowedHostname: hostname,
      }).catch(() => ({
        pageLinks: [] as string[],
        normalizedImages: [] as ExtractedImage[],
        supportedImages: [] as ExtractedImage[],
        title: "",
        content: "",
      }));

      const anchors = await p
        .$$eval("a[href]", (links) =>
          links.map((a) => (a as HTMLAnchorElement).href).filter(Boolean),
        )
        .catch(() => [] as string[]);

      const initialSet = new Set<string>();
      initialSet.add(normalizeUrl({ u: rootUrl }));
      for (const a of anchors)
        initialSet.add(normalizeUrl({ u: a, base: rootUrl }));
      for (const a of extracted.pageLinks || [])
        initialSet.add(normalizeUrl({ u: a, base: rootUrl }));
      const initial = Array.from(initialSet);
      if (logger) {
        logger(`Seeded ${initial.length} initial links from root`);
      }
      enqueueLinks(initial);
      try {
        await p.close();
      } catch {}
    }

    const workers: Promise<void>[] = [];
    for (let i = 0; i < concurrency; i++) {
      workers.push(
        (async () => {
          const page: Page = await browser.newPage();
          await page.setViewport({
            width: SCRAPER_VIEWPORT_WIDTH,
            height: SCRAPER_VIEWPORT_HEIGHT,
          });
          try {
            await attachDefaultInterception(page).catch(() => {});
          } catch {}
          try {
            while (true) {
              if (shouldCancel && (await Promise.resolve(shouldCancel())))
                throw new JobCancelled();
              const link = await getNextLink();
              if (!link) break;
              logProgress("🔎", `Starting ${formatLinkForConsole(link)}`);

              try {
                await page.goto(link, {
                  waitUntil: SCRAPER_NAV_WAITUNTIL,
                  timeout: SCRAPER_NAV_TIMEOUT_MS,
                });
                if (password) {
                  const host = new URL(rootUrl).hostname;
                  if (!loggedInHostnames.has(host)) {
                    try {
                      await tryLogin({ page, password });
                      loggedInHostnames.add(host);
                      if (logger)
                        logger(
                          `Login attempt complete on ${formatLinkForConsole(link)}`,
                        );
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
                  processingLink = final;
                }

                const hostname = new URL(rootUrl).hostname;

                // If the final (resolved) URL is on a different hostname than the
                // project root, skip it. This prevents the scraper from creating
                // page rows for external domains (e.g. terms.zeroheight.com).
                try {
                  const procHost = new URL(processingLink).hostname;
                  if (procHost !== hostname) {
                    if (logger)
                      logger(
                        `Skipping external host ${processingLink} (allowed: ${hostname})`,
                      );
                    // mark as processed so we don't retry it
                    processed.add(processingLink);
                    if (processingLink !== link) processed.add(link);
                    // update activity counters and continue to next link
                    progress.pagesProcessed++;
                    inProgressCount = Math.max(0, inProgressCount - 1);
                    lastActivity = Date.now();
                    continue;
                  }
                } catch {
                  // if URL parsing fails, fall through and let later logic handle it
                }
                const preExtractedLocal = preExtractedMap;
                let title: string;
                let content: string;
                let supportedImages: ExtractedImage[];
                let normalizedImages: Array<{ src: string; alt: string }>;
                let pageLinks: string[];
                if (
                  preExtractedLocal &&
                  preExtractedLocal.has(processingLink)
                ) {
                  const e = preExtractedLocal.get(processingLink)!;
                  title = e.title;
                  content = e.content;
                  supportedImages = e.supportedImages || [];
                  normalizedImages = e.normalizedImages || [];
                  pageLinks = e.pageLinks || [];
                } else {
                  const extracted = await extractPageData({
                    page,
                    pageUrl: processingLink,
                    allowedHostname: hostname,
                  });
                  title = extracted.title;
                  content = extracted.content;
                  supportedImages = extracted.supportedImages || [];
                  normalizedImages = extracted.normalizedImages || [];
                  pageLinks = extracted.pageLinks || [];
                }

                if (supportedImages.length > 0) {
                  progress.total += supportedImages.length;
                  checkProgressInvariant({
                    overallProgress: progress,
                    context: "reserve images for page-v2",
                  });
                  lastActivity = Date.now();
                }

                const { storage } = getClient();

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
                  overallProgress: progress,
                  allExistingImageUrls,
                  pendingImageRecords,
                  logProgress,
                  shouldCancel: undefined,
                  checkProgressInvariant: (p: OverallProgress, ctx: string) =>
                    checkProgressInvariant({
                      overallProgress: p,
                      context: ctx,
                    }),
                  preExtracted: {
                    title,
                    content,
                    supportedImages,
                    normalizedImages,
                    pageLinks,
                  },
                });

                const rawLinks = (returnedPageLinks ||
                  pageLinks ||
                  []) as string[];
                const allowed = rawLinks
                  .map((h) => normalizeUrl({ u: h, base: rootUrl }))
                  .filter((h) => {
                    try {
                      return new URL(h).hostname === hostname;
                    } catch {
                      return false;
                    }
                  });
                logProgress(
                  "🔗",
                  `Discovered ${allowed.length} links on ${formatLinkForConsole(processingLink)}`,
                );
                if (!restrictToSeeds) enqueueLinks(allowed);

                for (const img of retNorm || [])
                  uniqueAllImageUrls.add(img.src);
                for (const img of retNorm || []) {
                  if (
                    (retSupported || []).find(
                      (s: { src: string }) => s.src === img.src,
                    )
                  )
                    uniqueAllowedImageUrls.add(img.src);
                  else uniqueUnsupportedImageUrls.add(img.src);
                }

                pagesToUpsert.push(pageUpsert);
                processedPages.push(processedPageEntry);
                imagesStats.processed += imgStats.processed || 0;
                imagesStats.uploaded += imgStats.uploaded || 0;
                imagesStats.skipped += imgStats.skipped || 0;
                imagesStats.failed += imgStats.failed || 0;

                progress.pagesProcessed++;
                processed.add(processingLink);
                if (processingLink !== link) processed.add(link);
                logProgress(
                  "✅",
                  `Processed ${formatLinkForConsole(processingLink)}`,
                );
              } catch (e) {
                pagesFailed++;
                if (logger)
                  logger(
                    `Error processing ${formatLinkForConsole(link)}: ${String(e)}`,
                  );
              } finally {
                inProgressCount = Math.max(0, inProgressCount - 1);
                lastActivity = Date.now();
              }
            }
          } finally {
            try {
              await page.close();
            } catch {}
          }
        })(),
      );
    }

    while (true) {
      if (shouldCancel && (await Promise.resolve(shouldCancel()))) {
        while (waiters.length) {
          const w = waiters.shift()!;
          w(null);
        }
        throw new JobCancelled();
      }

      if (queue.length === 0 && inProgressCount === 0) {
        await new Promise((r) =>
          setTimeout(r, Math.min(SCRAPER_MONITOR_IDLE_POLL_MS, idleTimeout)),
        );
        if (
          queue.length === 0 &&
          inProgressCount === 0 &&
          Date.now() - lastActivity >= idleTimeout
        )
          break;
      }
      await new Promise((r) => setTimeout(r, SCRAPER_MONITOR_POLL_MS));
    }

    while (waiters.length) {
      const w = waiters.shift()!;
      w(null);
    }

    await Promise.all(workers);

    let bulkLines: string[] | undefined;
    let printedBox = false;
    try {
      const { client: db } = getClient();
      const printer = (s: string) => {
        if (logger) logger(s);
        else console.log(s);
      };
      const res = await bulkUpsertPagesAndImages({
        db: db!,
        pagesToUpsert,
        pendingImageRecords,
        uniqueAllowedImageUrls,
        uniqueAllImageUrls,
        uniqueUnsupportedImageUrls,
        allExistingImageUrls,
        imagesStats,
        pagesFailed: pagesFailed,
        providedCount: pageUrls && pageUrls.length > 0 ? pageUrls.length : 0,
      });
      bulkLines = res.lines;
      if (bulkLines && bulkLines.length) printer(bulkLines.join("\n"));
      printedBox = true;
    } catch (e) {
      console.warn("V2 bulkUpsert failed:", e);
    } finally {
      if (!printedBox) {
        const printer = (s: string) => {
          if (logger) logger(s);
          else console.log(s);
        };
        try {
          const { client: db } = getClient();
          const res = await bulkUpsertPagesAndImages({
            db: db!,
            pagesToUpsert,
            pendingImageRecords,
            uniqueAllowedImageUrls,
            uniqueAllImageUrls,
            uniqueUnsupportedImageUrls,
            allExistingImageUrls,
            imagesStats,
            pagesFailed: pagesFailed,
            providedCount:
              pageUrls && pageUrls.length > 0 ? pageUrls.length : 0,
            dryRun: true,
          });
          if (res.lines && res.lines.length) printer(res.lines.join("\n"));
        } catch {
          const uniquePageMap = new Map(
            pagesToUpsert.map((p) => [p.url, p] as const),
          );
          const totalUniquePages = uniquePageMap.size;
          const providedCountVal =
            pageUrls && pageUrls.length > 0 ? pageUrls.length : 0;
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
            imagesAlreadyAssociatedCount: Array.from(
              uniqueAllowedImageUrls,
            ).filter((u) => allExistingImageUrls.has(u)).length,
          };
          const boxed = formatSummaryBox({ p: params });
          if (boxed && boxed.length) printer(boxed.join("\n"));
        }
      }
    }

    await browser.close();

    return createSuccessResponse({
      data: { debug: { seedUrl: rootUrl }, progress },
    });
  } catch (err) {
    if (err instanceof JobCancelled)
      return createSuccessResponse({ data: { message: "Job cancelled" } });
    return createErrorResponse({
      message: String(err instanceof Error ? err.message : err),
    });
  }
}

import type { ToolDefinition } from "@/tools/toolTypes";

const scrapeInput = z.object({
  pageUrls: z.array(z.string()).optional(),
  password: z.string().optional(),
});

export const scrapeTool: ToolDefinition<typeof scrapeInput> = {
  title: "SCRAPER_scrape",
  description:
    "Start an asynchronous scraping job for the configured Zeroheight project. Seeds from the project root or provided page URLs; extracts pages and records page content and remote image URLs to the database as a background job.",
  inputSchema: scrapeInput,
  handler: async ({ pageUrls, password }: z.infer<typeof scrapeInput>) => {
    const projectUrl = ZEROHEIGHT_PROJECT_URL;
    if (!projectUrl)
      return createErrorResponse({ message: "ZEROHEIGHT_PROJECT_URL not set" });

    let jobId: string | null = null;
    try {
      jobId = await createJobInDb({
        name: "scrape",
        args: { pageUrls: pageUrls || null },
      });
    } catch (err) {
      console.warn("createJobInDb failed:", err);
    }
    if (!jobId)
      jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    (async () => {
      const logger = async (s: string) => {
        try {
          await appendJobLog({
            jobId: jobId as string,
            line: `[${new Date().toISOString()}] ${s}`,
          });
        } catch {}
        if (SCRAPER_DEBUG) console.log(`[debug] ${s}`);
        else console.log(s);
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
              const j = await getJobFromDb({ jobId: jobId as string });
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
          structuredResult = (res as Record<string, unknown>).progress ?? res;
        }
        await finishJob({
          jobId: jobId as string,
          success: true,
          result: structuredResult,
        });
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        if (e instanceof JobCancelled) {
          await appendJobLog({
            jobId: jobId as string,
            line: "Job cancelled by request",
          });
          await finishJob({ jobId: jobId as string, success: false });
        } else {
          await appendJobLog({
            jobId: jobId as string,
            line: `Error: ${errMsg}`,
          });
          await finishJob({
            jobId: jobId as string,
            success: false,
            result: undefined,
            errorMsg: errMsg,
          });
        }
      }
    })();

    return createSuccessResponse({ data: { message: "Job started" } });
  },
};
