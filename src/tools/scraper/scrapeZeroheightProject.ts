import { z } from "zod";
import puppeteer from "puppeteer";
import type { Page } from "puppeteer";
import {
  createSuccessResponse,
  createErrorResponse,
} from "@/utils/toolResponses";
import { JobCancelled } from "@/utils/common/errors";
import {
  getClient,
  checkProgressInvariant,
} from "@/utils/common/supabaseClients";
import { createProgressHelpers } from "./shared";
import type { PagesType, ImagesType } from "@/database.types";
import type { OverallProgress } from "./processPageAndImages";
import { extractPageData } from "./pageExtraction";
import type { ExtractedImage } from "./pageExtraction";
import { processPageAndImages } from "./processPageAndImages";
import prefetchSeeds, { normalizeUrl } from "./prefetch";
import { SCRAPER_LOG_LINK_SAMPLE } from "@/utils/config";
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
} from "./bulkUpsert";
import {
  createJobInDb,
  appendJobLog,
  finishJob,
  getJobFromDb,
} from "./jobStore";
import { tryLogin } from "@/utils/common/scraperHelpers";

// Primary scraper (previously V2) - coordinator-based queue, deterministic totals, parallel workers
export async function scrapeZeroheightProject(
  rootUrl: string,
  password?: string,
  pageUrls?: string[],
  logger?: (s: string) => void,
  shouldCancel?: () => boolean | Promise<boolean>,
) {
  try {
    const concurrency = SCRAPER_CONCURRENCY;
    const idleTimeout = SCRAPER_IDLE_TIMEOUT_MS;
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
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

    // Use `normalizeUrl` from `prefetch.ts` to keep canonicalization consistent.

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
        // Wake any waiters
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
    const { logProgress } = createProgressHelpers(
      progress,
      checkProgressInvariant,
      logger,
    );

    const restrictToSeeds = !!(pageUrls && pageUrls.length > 0);

    // Load existing images from DB so image processors can skip duplicates
    const { client: db } = getClient();
    const imagesTable = "images" as const;
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
          } catch {
            // keep original if parsing fails or empty
          }
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

    // Seed
    if (pageUrls && pageUrls.length > 0) {
      const normalized = pageUrls.map((p) => normalizeUrl(p, rootUrl));
      // Prefetch seeds in a robust helper (root login, retries, scrolls)
      const { preExtractedMap: seedMap } = await prefetchSeeds({
        browser,
        rootUrl,
        seeds: normalized,
        password,
        concurrency: SCRAPER_SEED_PREFETCH_CONCURRENCY,
        logger,
      });

      // Merge into local preExtractedMap used by workers
      for (const [k, v] of seedMap) preExtractedMap.set(k, v as PreExtracted);

      // Enqueue normalized seeds
      enqueueLinks(normalized);
      logProgress("⚑", `Seeded ${normalized.length} initial links`);
    } else {
      const p = await browser.newPage();
      await p.setViewport({
        width: SCRAPER_VIEWPORT_WIDTH,
        height: SCRAPER_VIEWPORT_HEIGHT,
      });
      await p.goto(rootUrl, {
        waitUntil: SCRAPER_NAV_WAITUNTIL,
        timeout: SCRAPER_NAV_TIMEOUT_MS,
      });
      if (password) {
        try {
          await tryLogin(p, password);
          if (logger) logger("Login attempt complete on root page");
        } catch (e) {
          if (logger) logger(`Login attempt failed: ${String(e)}`);
        }
      }

      const hostname = new URL(rootUrl).hostname;
      const extracted = await extractPageData(p, rootUrl, hostname).catch(
        () => ({
          pageLinks: [] as string[],
          normalizedImages: [] as ExtractedImage[],
          supportedImages: [] as ExtractedImage[],
          title: "",
          content: "",
        }),
      );

      const anchors = await p
        .$$eval("a[href]", (links) =>
          links.map((a) => (a as HTMLAnchorElement).href).filter(Boolean),
        )
        .catch(() => [] as string[]);

      const initialSet = new Set<string>();
      initialSet.add(normalizeUrl(rootUrl));
      for (const a of anchors) initialSet.add(normalizeUrl(a, rootUrl));
      for (const a of extracted.pageLinks || [])
        initialSet.add(normalizeUrl(a, rootUrl));
      const initial = Array.from(initialSet);
      if (logger) {
        logger(`Seeded ${initial.length} initial links from root`);
      }
      enqueueLinks(initial);
      try {
        await p.close();
      } catch {}
    }

    // Workers
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
            while (true) {
              if (shouldCancel && (await Promise.resolve(shouldCancel())))
                throw new JobCancelled();
              const link = await getNextLink();
              if (!link) break;
              // Log page start so progress bar shows each step
              logProgress("🔎", `Starting ${formatLinkForConsole(link)}`);

              try {
                await page.goto(link, {
                  waitUntil: SCRAPER_NAV_WAITUNTIL,
                  timeout: SCRAPER_NAV_TIMEOUT_MS,
                });
                if (password) {
                  try {
                    await tryLogin(page, password);
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

                // If the page redirected, use the final normalized URL as canonical
                const finalRaw = page.url();
                const final = normalizeUrl(finalRaw, rootUrl);
                let processingLink = link;
                if (final && final !== link) {
                  redirects.set(link, final);
                  processingLink = final;
                }

                const hostname = new URL(rootUrl).hostname;
                // If seeds were pre-extracted, use that to avoid double extraction
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
                  const extracted = await extractPageData(
                    page,
                    processingLink,
                    hostname,
                  );
                  title = extracted.title;
                  content = extracted.content;
                  supportedImages = extracted.supportedImages || [];
                  normalizedImages = extracted.normalizedImages || [];
                  pageLinks = extracted.pageLinks || [];
                }

                if (supportedImages.length > 0) {
                  progress.total += supportedImages.length;
                  checkProgressInvariant(
                    progress,
                    "reserve images for page-v2",
                  );
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
                  checkProgressInvariant,
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
                  .map((h) => normalizeUrl(h, rootUrl))
                  .filter((h) => {
                    try {
                      return new URL(h).hostname === hostname;
                    } catch {
                      return false;
                    }
                  });
                // Show discovery with progress bar (use canonical processingLink)
                logProgress(
                  "🔗",
                  `Discovered ${allowed.length} links on ${formatLinkForConsole(processingLink)}`,
                );
                if (logger && allowed.length)
                  logger(
                    `Discovered ${allowed.length} links on ${formatLinkForConsole(
                      processingLink,
                    )}: ${allowed
                      .slice(0, SCRAPER_LOG_LINK_SAMPLE)
                      .map(formatLinkForConsole)
                      .join(", ")}`,
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
                // Mark canonical and original as processed to avoid requeue after redirects
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

    // Monitor
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

    // Bulk upsert
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
      for (const line of bulkLines) printer(line);
      // Do not print an additional boxed summary here; rely on the bulkUpsert
      // output so the console output matches the full-project run exactly.
      printedBox = true;
    } catch (e) {
      console.warn("V2 bulkUpsert failed:", e);
    } finally {
      // If bulk upsert failed or didn't print, attempt to reuse the exact same
      // formatting logic from bulkUpsert by calling it in dryRun mode. If that
      // also fails, fall back to a concise in-process box.
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
          for (const line of res.lines) printer(line);
        } catch {
          // Best-effort fallback: derive counts from what we have and use the
          // shared `formatSummaryBox` to ensure consistent formatting.
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
          const boxed = formatSummaryBox(params);
          for (const l of boxed) printer(l);
        }
      }
    }

    await browser.close();

    return createSuccessResponse({ debug: { seedUrl: rootUrl }, progress });
  } catch (err) {
    if (err instanceof JobCancelled)
      return createSuccessResponse({ message: "Job cancelled" });
    return createErrorResponse(
      String(err instanceof Error ? err.message : err),
    );
  }
}

export const scrapeZeroheightProjectTool = {
  title: "scrape-zeroheight-project",
  description: "A faster, coordinator-based scraper (was v2).",
  inputSchema: z.object({
    pageUrls: z.array(z.string()).optional(),
  }),
  handler: async ({ pageUrls }: { pageUrls?: string[] }) => {
    const projectUrl = ZEROHEIGHT_PROJECT_URL;
    if (!projectUrl)
      return createErrorResponse("ZEROHEIGHT_PROJECT_URL not set");

    // Create a DB-backed job so external tools can observe progress
    let jobId: string | null = null;
    try {
      jobId = await createJobInDb("scrape-zeroheight-project", {
        pageUrls: pageUrls || null,
      });
    } catch (err) {
      console.warn("createJobInDb failed:", err);
    }
    if (!jobId)
      jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    (async () => {
      const logger = async (s: string) => {
        try {
          await appendJobLog(
            jobId as string,
            `[${new Date().toISOString()}] ${s}`,
          );
        } catch {
          /* ignore logging errors */
        }
        console.log(`[scraper][${new Date().toISOString()}] ${s}`);
      };

      try {
        const res = await scrapeZeroheightProject(
          projectUrl,
          undefined,
          pageUrls || undefined,
          (msg: string) => {
            void logger(msg);
          },
          async () => {
            try {
              const j = await getJobFromDb(jobId as string);
              return !!(
                j &&
                (j.status === "cancelled" || j.status === "failed")
              );
            } catch {
              return false;
            }
          },
        );
        // Store structured result if available (prefer `progress` field)
        let structuredResult: unknown = res;
        if (
          res &&
          typeof res === "object" &&
          Object.prototype.hasOwnProperty.call(res, "progress")
        ) {
          const r = res as Record<string, unknown>;
          structuredResult = r.progress ?? res;
        }
        await finishJob(jobId as string, true, structuredResult);
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        if (e instanceof JobCancelled) {
          await appendJobLog(jobId as string, "Job cancelled by request");
          await finishJob(jobId as string, false);
        } else {
          await appendJobLog(jobId as string, `Error: ${errMsg}`);
          await finishJob(jobId as string, false, undefined, errMsg);
        }
      }
    })();

    return createSuccessResponse({ message: "Job started" });
  },
};
