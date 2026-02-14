import { z } from "zod";
import puppeteer from "puppeteer";
import type { Page } from "puppeteer";
import { createErrorResponse, createSuccessResponse } from "@/lib/common";
import { JobCancelled } from "@/lib/common/errors";
import {
  getClient,
  checkProgressInvariant,
} from "@/lib/common/supabaseClients";
import { createProgressHelpers } from "./shared";
import { tryLogin } from "@/lib/common/scraperHelpers";

import { processImagesForPage } from "./pageProcessors";
import type { PagesType, ImagesType } from "@/lib/database.types";
// Page extraction handles excluded image formats.

// Helper function to get URL path without host
function getUrlPath(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname + urlObj.search + urlObj.hash;
  } catch {
    return url; // Return original if parsing fails
  }
}

// Discover pages on the project or validate provided page URLs.
async function discoverPages(
  page: Page,
  url: string,
  allowedHostname: string,
  pageUrls?: string[],
) {
  if (pageUrls && pageUrls.length > 0) {
    // Validate that all provided URLs are on the same hostname
    const invalidUrls = pageUrls.filter((pageUrl) => {
      try {
        const urlObj = new URL(pageUrl);
        return urlObj.hostname !== allowedHostname;
      } catch {
        return true; // Invalid URL
      }
    });

    if (invalidUrls.length > 0) {
      throw new Error(
        `All page URLs must be on the same hostname as the project (${allowedHostname}). Invalid URLs: ${invalidUrls.join(", ")}`,
      );
    }

    return {
      allLinks: new Set(pageUrls),
      allLinksOnPage: [] as string[],
      zhPageLinks: [] as string[],
      currentPageUrl: "",
    };
  }

  // Discover links automatically from the project's main page
  const allLinksOnPage = await page.$$eval(
    "a[href]",
    (links, base) =>
      links
        .map((link) => link.href)
        .filter((href) => {
          if (
            !href ||
            href.startsWith("#") ||
            href.startsWith("mailto:") ||
            href.startsWith("tel:")
          )
            return false;
          try {
            const linkUrl = new URL(href, base);
            return linkUrl.hostname === new URL(base).hostname;
          } catch {
            return false;
          }
        }),
    url,
  );

  const zhPageLinks = await page.$$eval(
    'a[href*="/p/"]',
    (links, base) =>
      links
        .map((link) => link.href)
        .filter((href) => {
          try {
            const linkUrl = new URL(href, base);
            return linkUrl.hostname === new URL(base).hostname;
          } catch {
            return false;
          }
        }),
    url,
  );

  const currentPageUrl = page.url();

  const allLinks = new Set([...allLinksOnPage, ...zhPageLinks, currentPageUrl]);

  return { allLinks, allLinksOnPage, zhPageLinks, currentPageUrl };
}

export async function scrapeZeroheightProject(
  url: string,
  password?: string,
  pageUrls?: string[],
  logger?: (msg: string) => void,
  // Optional cooperative cancellation callback. When it returns true the
  // scraper should stop promptly by throwing an error.
  shouldCancel?: () => boolean,
) {
  try {
    console.log("Starting Zeroheight project scrape...");

    const { client: supabase, storage } = getClient();
    const db = supabase;
    const imagesTable = "images" as const;

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1024 });

    // Navigate to the project URL and try to login if a password is provided
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    if (password) {
      console.log("Password provided, checking for login form...");
      await tryLogin(page, password);
      console.log("Login attempt complete, continuing...");
    }

    const allowedHostname = new URL(url).hostname;

    let allLinks: Set<string> = new Set();
    const processedLinks = new Set<string>();

    let allLinksOnPage: string[] = [];
    let zhPageLinks: string[] = [];
    let currentPageUrl: string = "";

    try {
      const discovered = await discoverPages(
        page,
        url,
        allowedHostname,
        pageUrls,
      );
      allLinks = discovered.allLinks;
      allLinksOnPage = discovered.allLinksOnPage;
      zhPageLinks = discovered.zhPageLinks;
      currentPageUrl = discovered.currentPageUrl;
      if (allLinksOnPage.length)
        console.log(`Found ${allLinksOnPage.length} links on main page`);
      if (zhPageLinks.length)
        console.log(
          `Found ${zhPageLinks.length} Zeroheight page links (/p/ pattern)`,
        );
      if (zhPageLinks.length)
        console.log(
          `Sample ZH page links: ${zhPageLinks.slice(0, 5).join(", ")}`,
        );
      if (currentPageUrl) console.log(`Current page URL: ${currentPageUrl}`);
    } catch (err) {
      console.error(String(err));
      return createErrorResponse(
        String(err instanceof Error ? err.message : err),
      );
    }

    // Get all existing image URLs globally to prevent duplicates (do this once at the start)
    const { data: allExistingImages, error: allExistingImagesError } = await db!
      .from(imagesTable)
      .select("original_url");

    if (allExistingImagesError) {
      console.error(
        `Error fetching all existing images:`,
        allExistingImagesError,
      );
    }

    const allExistingImageUrls = new Set(
      allExistingImages?.map((img) => {
        // Normalize the URL for comparison (same logic as used for new images)
        let normalizedUrl = img.original_url;
        if (normalizedUrl.includes("cdn.zeroheight.com")) {
          try {
            const url = new URL(normalizedUrl);
            normalizedUrl = `${url.protocol}//${url.hostname}${url.pathname}`;
          } catch {
            // If URL parsing fails, keep original
          }
        }
        if (
          normalizedUrl.includes("s3.") ||
          normalizedUrl.includes("amazonaws.com")
        ) {
          try {
            const url = new URL(normalizedUrl);
            normalizedUrl = `${url.protocol}//${url.hostname}${url.pathname}`;
          } catch {
            // If URL parsing fails, keep original
          }
        }
        return normalizedUrl;
      }) || [],
    );

    console.log(
      `Found ${allExistingImageUrls.size} existing images in database`,
    );

    // Track processed pages for return value
    const processedPages: Array<{
      url: PagesType["url"];
      title: PagesType["title"];
      content: PagesType["content"];
      images: Array<{ src: string; alt: string }>;
    }> = [];

    console.log(`Total unique links to process: ${allLinks.size}`);

    // When specific pageUrls are provided, process all of them. Otherwise, process all discovered links.
    const maxPages = pageUrls && pageUrls.length > 0 ? allLinks.size : Infinity;

    // Unified progress tracking across pages and images
    const overallProgress = {
      current: 0,
      total: maxPages === Infinity ? allLinks.size : maxPages, // Start with known pages/links
      pagesProcessed: 0,
      imagesProcessed: 0,
    };

    // Progress helpers (shared implementation)
    const { logProgress, markAttempt } = createProgressHelpers(
      overallProgress,
      checkProgressInvariant,
      logger,
    );

    // Phase 1: Discover all pages and collect page data; upload images immediately
    const pagesToUpsert: Array<Pick<PagesType, "url" | "title" | "content">> =
      [];

    // Images uploaded during scraping; DB records will be inserted in bulk after pages are upserted
    const pendingImageRecords: Array<{
      pageUrl: string;
      original_url: ImagesType["original_url"];
      storage_path: ImagesType["storage_path"];
    }> = [];

    // Aggregate image processing statistics across pages
    const imagesStats = { processed: 0, uploaded: 0, skipped: 0, failed: 0 };
    // Track unique image URLs for reporting (normalized)
    const uniqueAllImageUrls = new Set<string>();
    const uniqueUnsupportedImageUrls = new Set<string>();
    const uniqueAllowedImageUrls = new Set<string>();

    let processedCount = 0;
    let pagesFailed = 0;

    // Discover all pages and collect image URLs
    while (processedCount < maxPages) {
      // Get the next link to process (remove it from the set)
      const linkValue = allLinks.values().next().value;
      if (!linkValue) break; // No more links to process
      let link = linkValue;
      allLinks.delete(link);

      // Cooperative cancellation check: stop promptly if requested
      if (shouldCancel && shouldCancel()) {
        markAttempt(
          "cancelled",
          "⏹️",
          `Cancellation requested - stopping scrape`,
        );
        throw new JobCancelled();
      }

      if (processedLinks.has(link)) {
        markAttempt(
          "skip already processed link",
          "🚫",
          `Skipping ${getUrlPath(link)} - already processed`,
        );
        continue;
      }

      try {
        await page.goto(link, { waitUntil: "networkidle2", timeout: 30000 });

        // Check for redirects and normalize URL
        const finalUrl = page.url();
        if (finalUrl !== link) {
          if (processedLinks.has(finalUrl)) {
            markAttempt(
              "skip redirect already processed",
              "🚫",
              "Skipping page - already processed (redirected)",
            );
            continue;
          }
          // Use the final URL for processing instead of the original link
          link = finalUrl;
        }

        processedLinks.add(link);

        processedCount++;
        overallProgress.pagesProcessed = processedCount;
        overallProgress.current++; // Increment current for each page processed
        checkProgressInvariant(overallProgress, "page processed");

        const {
          title: pageTitle,
          content: pageContent,
          supportedImages,
          normalizedImages,
          pageLinks,
        } = await import("./pageExtraction").then((m) =>
          m.extractPageData(page, link, allowedHostname),
        );

        const title = pageTitle;
        const content = pageContent;

        // Only discover additional links if we're not using specific URLs
        if (!pageUrls || pageUrls.length === 0) {
          pageLinks.forEach((newLink) => {
            if (
              !allLinks.has(newLink) &&
              !processedLinks.has(newLink) &&
              processedCount < maxPages
            ) {
              allLinks.add(newLink);
              overallProgress.total++; // Update total to include newly discovered links
              checkProgressInvariant(
                overallProgress,
                "new discovered page (pageLinks)",
              );
            }
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Update unique image URL sets (normalized src values)
        for (const img of normalizedImages) uniqueAllImageUrls.add(img.src);
        for (const img of normalizedImages) {
          if (supportedImages.find((s) => s.src === img.src)) {
            uniqueAllowedImageUrls.add(img.src);
          } else {
            uniqueUnsupportedImageUrls.add(img.src);
          }
        }

        // Defer page DB writes; collect for bulk upsert
        pagesToUpsert.push({ url: link, title, content });

        // Log images found on this page and update total
        if (supportedImages.length > 0) {
          // Update total to include these images
          overallProgress.total += supportedImages.length;
          checkProgressInvariant(overallProgress, "after adding images");
          logProgress(
            "📷",
            `Found ${supportedImages.length} supported image${
              supportedImages.length === 1 ? "" : "s"
            } on this page (${normalizedImages.length - supportedImages.length} filtered out)`,
          );
        }

        // Track for return value
        processedPages.push({
          url: link,
          title,
          content,
          images: supportedImages.map((img) => ({
            src: img.src,
            alt: img.alt,
          })),
        });

        // Process images for this page (delegated to helper)
        const imgStats = await processImagesForPage({
          supportedImages,
          link,
          storage,
          overallProgress,
          allExistingImageUrls,
          pendingImageRecords,
          logProgress,
          shouldCancel,
        });

        // aggregate image stats
        imagesStats.processed += imgStats.processed || 0;
        imagesStats.uploaded += imgStats.uploaded || 0;
        imagesStats.skipped += imgStats.skipped || 0;
        imagesStats.failed += imgStats.failed || 0;

        logProgress(
          "📄",
          `Processing page ${processedCount}: ${getUrlPath(link)}`,
        );

        // Only discover new links if we're not using specific URLs
        if (!pageUrls || pageUrls.length === 0) {
          // Discover new links on this page
          const newLinks = await page.$$eval(
            "a[href]",
            (links, projUrl, host) =>
              links
                .map((link) => link.href)
                .filter((href) => {
                  if (
                    !href ||
                    href.startsWith("#") ||
                    href.startsWith("mailto:") ||
                    href.startsWith("tel:")
                  )
                    return false;
                  try {
                    const linkUrl = new URL(href, projUrl);
                    return (
                      linkUrl.hostname === host &&
                      linkUrl.href !== projUrl &&
                      linkUrl.href !== window.location.href
                    );
                  } catch {
                    return false;
                  }
                }),
            url,
            allowedHostname,
          );

          let actuallyNewLinksCount = 0;

          if (shouldCancel && shouldCancel()) {
            markAttempt(
              "cancelled",
              "⏹️",
              `Cancellation requested - stopping after discovery`,
            );
            throw new JobCancelled();
          }
          newLinks.forEach((newLink) => {
            if (
              !allLinks.has(newLink) &&
              !processedLinks.has(newLink) &&
              processedCount < maxPages
            ) {
              allLinks.add(newLink);
              overallProgress.total++; // Update total to include newly discovered links
              checkProgressInvariant(
                overallProgress,
                "new discovered page (newLinks)",
              );
              actuallyNewLinksCount++;
            }
          });

          if (actuallyNewLinksCount > 0) {
            logProgress(
              "🔍",
              `${actuallyNewLinksCount} new links discovered on this page (automatic mode)`,
            );
          }
        }
      } catch (e) {
        // If this is a cooperative cancellation, rethrow so the outer
        // handler can handle it cleanly (avoid noisy stack traces here).
        if (e instanceof JobCancelled) {
          markAttempt(
            "cancelled",
            "⏹️",
            `Cancellation requested - stopping scrape during ${getUrlPath(link)}`,
          );
          throw e;
        }

        console.error(`Failed to scrape ${getUrlPath(link)}:`, e);
        // Count the failed attempt and record as a failed page
        pagesFailed++;
        markAttempt(
          "failed scrape catch",
          "❌",
          `Failed to scrape ${getUrlPath(link)}`,
        );
      }
    }

    console.log(
      `Scraping completed. Final progress: [${overallProgress.current}/${overallProgress.total}]`,
    );
    console.log();

    // Bulk upsert pages + images (delegated)
    if (pagesToUpsert.length > 0) {
      const { bulkUpsertPagesAndImages } = await import("./bulkUpsert");
      const { lines } = await bulkUpsertPagesAndImages({
        db,
        pagesToUpsert,
        pendingImageRecords,
        uniqueAllowedImageUrls,
        uniqueAllImageUrls,
        uniqueUnsupportedImageUrls,
        allExistingImageUrls,
        imagesStats,
        pagesFailed,
        providedCount: pageUrls && pageUrls.length > 0 ? pageUrls.length : 0,
      });

      const contentWidth = Math.max(...lines.map((l) => l.length));
      const innerWidth = contentWidth + 2;
      const top = "┌" + "─".repeat(innerWidth) + "┐";
      const bottom = "└" + "─".repeat(innerWidth) + "┘";
      console.log(top);
      for (const line of lines) {
        const padded = " " + line.padEnd(contentWidth) + " ";
        console.log("│" + padded + "│");
      }
      console.log(bottom);
    }

    // Bulk discovery summary is shown above in the boxed output; no extra lines needed.

    // All pages and images are now processed during discovery phase

    const finalPageTitle = await page.title();
    await browser.close();

    const finalDebugInfo = {
      projectUrl: url,
      allowedHostname,
      finalPageTitle,
      totalLinksOnPage: allLinksOnPage?.length || 0,
      sampleLinks: allLinksOnPage?.slice(0, 5) || [],
      totalLinksFound: allLinks.size,
      pagesProcessed: processedPages.length,
      usedSpecificUrls: Boolean(pageUrls && pageUrls.length > 0),
      providedUrls: pageUrls || [],
    };

    return createSuccessResponse({
      debugInfo: finalDebugInfo,
      scrapedPages: processedPages,
    });
  } catch (error) {
    if (error instanceof JobCancelled) {
      console.log("Job cancelled");
      return createSuccessResponse({ message: "Job cancelled" });
    }
    console.error("Scraping error:", error);
    return createErrorResponse(
      "Error scraping project: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

export const scrapeZeroheightProjectTool = {
  title: "scrape-zeroheight-project",
  description:
    "Scrape the configured Zeroheight design system project and add/update page data in the database. Can scrape the complete project or specific page URLs. Uses upsert logic to handle duplicates, allowing safe re-running without clearing existing data.",
  inputSchema: z.object({
    pageUrls: z
      .array(z.string())
      .optional()
      .describe(
        "Specific page URLs to scrape instead of discovering links automatically",
      ),
  }),
  handler: async ({ pageUrls }: { pageUrls?: string[] }) => {
    const projectUrl = process.env.ZEROHEIGHT_PROJECT_URL;
    const password = process.env.ZEROHEIGHT_PROJECT_PASSWORD;

    if (!projectUrl) {
      return createErrorResponse(
        "Error: ZEROHEIGHT_PROJECT_URL environment variable not set",
      );
    }

    // Start an in-process background job via `jobManager` so MCP job tools
    // (`scrape-job-status`, `scrape-job-logs`) can observe it when running
    // in this server process.
    const { createJob, genId, getJob } = await import("./jobManager");
    const { createJobInDb } = await import("./jobStore");

    // Try to create a DB row via the server API so `scrape_jobs` shows this in the DB.
    // If that fails, fall back to an in-process id so the job still runs.
    let id: string | null = null;
    try {
      id = await createJobInDb("scrape-zeroheight-project", {
        pageUrls: pageUrls || null,
        password: password || null,
      });
    } catch (err) {
      console.warn("createJobInDb failed:", err);
    }
    if (!id) id = genId();

    const jobId = createJob(
      "scrape-zeroheight-project",
      async (logger) => {
        await scrapeZeroheightProject(
          projectUrl,
          password || undefined,
          pageUrls || undefined,
          (msg: string) => {
            try {
              logger(msg);
            } catch {
              // ignore logging errors
            }
          },
          () => !!getJob(id)?.cancelRequested,
        );
      },
      id,
    );

    return createSuccessResponse({ message: "Scrape started", jobId });
  },
};
