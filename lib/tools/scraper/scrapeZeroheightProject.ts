import { z } from "zod";
import puppeteer from "puppeteer";
import { createErrorResponse, createSuccessResponse } from "../../common";
import {
  getClient,
  checkProgressInvariant,
} from "../../common/supabaseClients";
import { createProgressHelpers } from "./shared";
import {
  tryLogin,
  uploadWithRetry,
  retryAsync,
  SupabaseResult,
  SupabaseClientMinimal,
} from "../../common/scraperHelpers";

import { processImagesForPage } from "./pageProcessors";

// Helper function to get URL path without host
function getUrlPath(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname + urlObj.search + urlObj.hash;
  } catch {
    return url; // Return original if parsing fails
  }
}

export async function scrapeZeroheightProject(
  url: string,
  password?: string,
  pageUrls?: string[],
) {
  try {
    console.log("Starting Zeroheight project scrape...");

    const { client, storage } = getClient();

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1024 });

    // Set timeout for navigation
    page.setDefaultTimeout(30000);

    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "networkidle0" });

    // Handle password if provided (lightweight helper)
    if (password) {
      console.log("Password provided, attempting login...");
      await tryLogin(page, password);
    } else {
      console.log("No password provided, proceeding without login");
    }

    // Wait for content to load
    await new Promise((resolve) => setTimeout(resolve, 5000));

    console.log(`Final URL after loading: ${page.url()}`);
    console.log(`Page title: ${await page.title()}`);

    // Final check for protected content indicators
    const hasContent = await page.$(
      '.content, .zh-content, main, [data-testid*="content"], .page-content',
    );
    console.log(`Content container found: ${!!hasContent}`);

    const bodyTextLength = await page.$eval(
      "body",
      (body) => (body.textContent || "").length,
    );
    console.log(`Body text length: ${bodyTextLength} characters`);

    const allowedHostname = new URL(url).hostname;

    console.log(`Project URL: ${getUrlPath(url)}`);
    console.log(`Allowed hostname: ${allowedHostname}`);

    let allLinks: Set<string>;
    const processedLinks = new Set<string>();

    let allLinksOnPage: string[] = [];
    let zhPageLinks: string[] = [];
    let currentPageUrl: string = "";

    if (pageUrls && pageUrls.length > 0) {
      // Use provided specific page URLs
      console.log(`Using ${pageUrls.length} specific page URLs provided`);
      console.log(`Page URLs: ${pageUrls.map(getUrlPath).join(", ")}`);

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
        console.error(
          `Invalid URLs provided (wrong hostname or malformed): ${invalidUrls.join(", ")}`,
        );
        return createErrorResponse(
          `All page URLs must be on the same hostname as the project (${allowedHostname}). Invalid URLs: ${invalidUrls.join(", ")}`,
        );
      }

      allLinks = new Set(pageUrls);
    } else {
      // Original behavior: discover links automatically
      console.log(
        "No specific page URLs provided, discovering links automatically...",
      );

      allLinksOnPage = await page.$$eval("a[href]", (links) =>
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
              const linkUrl = new URL(href, url);
              // Be more permissive: allow any link on the same hostname, don't exclude the exact projectUrl
              return linkUrl.hostname === allowedHostname;
            } catch {
              return false;
            }
          }),
      );

      if (allLinksOnPage.length) {
        console.log(`Found ${allLinksOnPage.length} links on main page`);
      }

      // Also check for Zeroheight-specific page links
      zhPageLinks = await page.$$eval('a[href*="/p/"]', (links) =>
        links
          .map((link) => link.href)
          .filter((href) => {
            try {
              const linkUrl = new URL(href, url);
              return linkUrl.hostname === allowedHostname;
            } catch {
              return false;
            }
          }),
      );
      if (zhPageLinks.length) {
        console.log(
          `Found ${zhPageLinks.length} Zeroheight page links (/p/ pattern)`,
        );
        console.log(
          `Sample ZH page links: ${zhPageLinks.slice(0, 5).join(", ")}`,
        );
      }

      // Always include the current page in scraping
      currentPageUrl = page.url();
      console.log(`Current page URL: ${currentPageUrl}`);

      allLinks = new Set([...allLinksOnPage, ...zhPageLinks, currentPageUrl]);
    }

    // Get all existing image URLs globally to prevent duplicates (do this once at the start)
    const { data: allExistingImages, error: allExistingImagesError } =
      await client!.from("images").select("original_url");

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
      url: string;
      title: string;
      content: string;
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
    );

    // Phase 1: Discover all pages and collect page data; upload images immediately
    const pagesToUpsert: Array<{
      url: string;
      title: string;
      content: string;
    }> = [];

    // Images uploaded during scraping; DB records will be inserted in bulk after pages are upserted
    const pendingImageRecords: Array<{
      pageUrl: string;
      original_url: string;
      storage_path: string;
    }> = [];

    let processedCount = 0;

    // Discover all pages and collect image URLs
    while (processedCount < maxPages) {
      // Get the next link to process (remove it from the set)
      const linkValue = allLinks.values().next().value;
      if (!linkValue) break; // No more links to process
      let link = linkValue;
      allLinks.delete(link);

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

        const title: string = await page.title();
        const content: string = await page
          .$eval(
            ".zh-content, .content, main .content, [data-testid='page-content'], .page-content",
            (el: Element) => el.textContent?.trim() || "",
          )
          .catch(() => {
            // Fallback: try to get content from the main content area excluding navigation
            return page.$eval("body", (body) => {
              // Remove navigation and header elements
              const clone = body.cloneNode(true) as HTMLElement;
              const navs = clone.querySelectorAll(
                "nav, header, .navigation, .header, .sidebar",
              );
              navs.forEach((nav) => nav.remove());

              // Try to find the main content area
              const mainContent = clone.querySelector(
                "main, .main, .content, .zh-content, [role='main']",
              );
              if (mainContent) {
                return mainContent.textContent?.trim() || "";
              }

              // Last resort: get all text but limit it
              return clone.textContent?.trim().substring(0, 10000) || "";
            });
          });

        // Only discover additional links if we're not using specific URLs
        if (!pageUrls || pageUrls.length === 0) {
          // Discover additional links on this page
          const pageLinks = await page.$$eval('a[href*="/p/"]', (links) =>
            links
              .map((link) => link.href)
              .filter((href) => {
                try {
                  const linkUrl = new URL(href);
                  return (
                    linkUrl.hostname === allowedHostname && href.includes("/p/")
                  );
                } catch {
                  return false;
                }
              }),
          );
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

        // Process images
        const images = await page.$$eval("img", (imgs: HTMLImageElement[]) =>
          imgs.map((img, index) => {
            let src = img.src;
            if (!src.startsWith("http")) {
              src = new URL(src, window.location.href).href;
            }
            return { src, alt: img.alt, index };
          }),
        );

        // Also find background images
        const bgImages = await page.$$eval(
          "*",
          (elements, imagesLength) => {
            return elements
              .map((el, index) => {
                const style = window.getComputedStyle(el);
                const bg = style.backgroundImage;
                if (bg && bg.startsWith("url(")) {
                  let url = bg.slice(4, -1).replace(/['"]/g, "");
                  if (!url.startsWith("http")) {
                    url = new URL(url, window.location.href).href;
                  }
                  if (url.startsWith("http")) {
                    return { src: url, alt: "", index: imagesLength + index };
                  }
                }
              })
              .filter(Boolean);
          },
          images.length,
        );

        const allImages = [...images, ...bgImages].filter(
          (img): img is { src: string; alt: string; index: number } =>
            Boolean(img),
        );

        // Normalize image URLs to prevent duplicates from signed URLs
        const normalizedImages = allImages.map((img) => {
          let normalizedSrc = img.src;

          // For Zeroheight CDN URLs, remove query parameters to normalize
          if (normalizedSrc.includes("cdn.zeroheight.com")) {
            try {
              const url = new URL(normalizedSrc);
              // Keep only the pathname for zeroheight CDN images
              normalizedSrc = `${url.protocol}//${url.hostname}${url.pathname}`;
            } catch {
              // If URL parsing fails, keep original
            }
          }

          // For S3 URLs, remove query parameters to normalize signed URLs
          if (
            normalizedSrc.includes("s3.") ||
            normalizedSrc.includes("amazonaws.com")
          ) {
            try {
              const url = new URL(normalizedSrc);
              normalizedSrc = `${url.protocol}//${url.hostname}${url.pathname}`;
            } catch {
              // If URL parsing fails, keep original
            }
          }

          return { ...img, src: normalizedSrc, originalSrc: img.src };
        });

        // Filter out unsupported image formats
        const supportedImages = normalizedImages.filter((img) => {
          const lowerSrc = img.src.toLowerCase();
          return !lowerSrc.includes(".gif") && !lowerSrc.includes(".svg");
        });

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
        await processImagesForPage({
          supportedImages,
          link,
          storage,
          overallProgress,
          allExistingImageUrls,
          pendingImageRecords,
          logProgress,
          uploadWithRetry,
        });

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
        console.error(`Failed to scrape ${getUrlPath(link)}:`, e);
        // Count the failed attempt as attempted work instead of mutating total
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

    // Bulk upsert pages
    if (pagesToUpsert.length > 0) {
      // Deduplicate pages by URL
      const pageMap = new Map<
        string,
        { url: string; title: string; content: string }
      >();
      for (const p of pagesToUpsert) pageMap.set(p.url, p);
      const uniquePages = Array.from(pageMap.values());

      const upsertResult = (await retryAsync(
        () =>
          (client! as unknown as SupabaseClientMinimal)
            .from("pages")
            .upsert(uniquePages, { onConflict: "url" })
            .select("id, url"),
        3,
        500,
      ).catch((e) => ({ error: e, data: null }))) as SupabaseResult<
        Array<{ id?: number; url?: string }>
      >;

      const { data: upsertedPages, error: upsertError } = upsertResult;

      if (upsertError) {
        console.error("Error bulk upserting pages:", upsertError);
      }

      // Map url -> id for image inserts
      const urlToId = new Map<string, number>();
      (upsertedPages || []).forEach(
        (p: { id?: number; url?: string } | null) => {
          if (p && p.url && p.id) urlToId.set(p.url, p.id);
        },
      );

      // Prepare image records using resolved page IDs
      const imagesToInsert = pendingImageRecords
        .map((r) => {
          const page_id = urlToId.get(r.pageUrl);
          if (!page_id) return null;
          return {
            page_id,
            original_url: r.original_url,
            storage_path: r.storage_path,
          };
        })
        .filter(Boolean) as Array<{
        page_id: number;
        original_url: string;
        storage_path: string;
      }>;

      if (imagesToInsert.length > 0) {
        const insertResult = await retryAsync(
          () =>
            (client! as unknown as SupabaseClientMinimal)
              .from("images")
              .insert(imagesToInsert),
          3,
          500,
        ).catch((e) => ({ error: e }));
        const { error: insertImagesError } =
          insertResult as SupabaseResult<unknown>;
        if (insertImagesError) {
          console.error("Error bulk inserting images:", insertImagesError);
        }
      }
    }

    // Show bulk discovery messages
    logProgress("📄", `Discovered ${pagesToUpsert.length} pages`);
    logProgress(
      "📷",
      `Uploaded ${pendingImageRecords.length} images (DB records inserted in bulk)`,
    );

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

    // Always perform a fresh scrape
    await scrapeZeroheightProject(projectUrl, password, pageUrls);
    console.log("Scraping completed successfully");
    return createSuccessResponse("Scraping completed successfully");
  },
};
