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
  SupabaseResult,
} from "../../common/scraperHelpers";

import { processImagesForPage } from "./pageProcessors";
import type { PagesType, ImagesType } from "../../database.types";
import { EXCLUDE_IMAGE_FORMATS } from "../../config";

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
  logger?: (msg: string) => void,
  // Optional cooperative cancellation callback. When it returns true the
  // scraper should stop promptly by throwing an error.
  shouldCancel?: () => boolean,
) {
  try {
    console.log("Starting Zeroheight project scrape...");

    const { client: supabase, storage } = getClient();
    const imagesTable = "images" as const;
    const pagesTable = "pages" as const;

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
      await supabase!.from(imagesTable).select("original_url");

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
        throw new Error("Job cancelled");
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

        // Filter out excluded image formats (configurable)
        const supportedImages = normalizedImages.filter((img) => {
          const lowerSrc = img.src.toLowerCase();
          // Check file extension against configured excluded formats
          for (const ext of EXCLUDE_IMAGE_FORMATS) {
            if (lowerSrc.includes(`.${ext}`)) return false;
          }
          return true;
        });

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
          uploadWithRetry,
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
            throw new Error("Job cancelled");
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

    // Bulk upsert pages
    if (pagesToUpsert.length > 0) {
      // Deduplicate pages by URL
      const pageMap = new Map<
        string,
        Pick<PagesType, "url" | "title" | "content">
      >();
      for (const p of pagesToUpsert) pageMap.set(p.url, p);
      const uniquePages = Array.from(pageMap.values());

      // Before upserting, check which of the unique pages already exist so we can
      // report inserted vs updated counts accurately.
      const uniqueUrls = uniquePages.map((p) => p.url);
      let existingPagesBefore: Array<{ url?: string } | null> = [];
      try {
        const { data: existingData } = await supabase!
          .from(pagesTable)
          .select("url")
          .in("url", uniqueUrls);
        existingPagesBefore = (existingData as Array<{ url?: string }>) || [];
      } catch (err) {
        console.warn("Could not query existing pages before upsert:", err);
      }

      const existingUrlSet = new Set(
        existingPagesBefore.map((p) => (p?.url ? p.url : "")).filter(Boolean),
      );

      // Manual retry loop for upserting pages to avoid Postgrest builder typing issues
      let upsertResult: SupabaseResult<Array<{ id?: number; url?: string }>> = {
        data: null,
        error: null,
      };
      {
        let attempts = 0;
        while (attempts < 3) {
          try {
            // Await the Postgrest response directly
            const res = await supabase!
              .from(pagesTable)
              .upsert(uniquePages, { onConflict: "url" })
              .select("id, url");
            upsertResult = res as SupabaseResult<
              Array<{ id?: number; url?: string }>
            >;
            if (!res.error) break;
          } catch (err) {
            upsertResult = { error: err, data: null } as SupabaseResult<
              Array<{ id?: number; url?: string }>
            >;
          }
          attempts++;
          if (attempts < 3) await new Promise((r) => setTimeout(r, 500));
        }
      }

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

      // Debug: report mapping and pending image records to diagnose association mismatches
      try {
        console.log(
          `DEBUG: pendingImageRecords.length = ${pendingImageRecords.length}`,
        );
        if (pendingImageRecords.length > 0) {
          console.log(
            "DEBUG: pendingImageRecords sample:",
            pendingImageRecords.slice(0, 10),
          );
        }
        console.log(`DEBUG: urlToId.size = ${urlToId.size}`);
        if (urlToId.size > 0) {
          console.log(
            "DEBUG: urlToId entries sample:",
            Array.from(urlToId.entries()).slice(0, 10),
          );
        }
      } catch (e) {
        // Keep debug non-fatal
        console.warn("DEBUG logging failed:", e);
      }

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
        original_url: ImagesType["original_url"];
        storage_path: ImagesType["storage_path"];
      }>;

      // Debug: report imagesToInsert and any pending records that couldn't be mapped to page_id
      try {
        console.log(`DEBUG: imagesToInsert.length = ${imagesToInsert.length}`);
        const missingRecords = pendingImageRecords.filter(
          (r) => !urlToId.has(r.pageUrl),
        );
        console.log(
          `DEBUG: pendingImageRecords missing page_id = ${missingRecords.length}`,
        );
        if (missingRecords.length > 0) {
          console.log(
            "DEBUG: missingRecords sample:",
            missingRecords.slice(0, 10),
          );
        }
      } catch (e) {
        console.warn("DEBUG logging failed:", e);
      }

      // Compute how many of the unique allowed images are already associated
      // with the processed pages in the DB. Use uniqueAllowedImageUrls set
      // gathered during processing so counts are deduplicated.
      let imagesAlreadyAssociatedCount = 0;
      try {
        const imagesFoundArray = Array.from(uniqueAllowedImageUrls);
        console.log(
          `DEBUG: uniqueAllowedImageUrls.size = ${imagesFoundArray.length}`,
        );

        if (imagesFoundArray.length > 0) {
          // For robustness against signed URLs and querystrings, query the DB
          // per-normalized-url using `ilike` to match prefixes (normalized path
          // followed by any query string). This handles cases where stored
          // `original_url` contains signature/query parameters.
          const pageIdSet = new Set<number>(Array.from(urlToId.values()));
          const matchedByNormalized = new Map<
            string,
            Array<{ original_url?: string; page_id?: number | null }>
          >();

          // Run queries sequentially to avoid overwhelming DB; counts are small.
          for (const norm of imagesFoundArray) {
            try {
              const { data: qdata, error: qerr } = await supabase!
                .from(imagesTable)
                .select("original_url, page_id")
                .ilike("original_url", `${norm}%`);

              if (qerr) {
                console.warn(
                  "DEBUG: query error for",
                  norm,
                  qerr.message || qerr,
                );
                continue;
              }
              if (qdata && qdata.length > 0)
                matchedByNormalized.set(
                  norm,
                  qdata as Array<{
                    original_url?: string;
                    page_id?: number | null;
                  }>,
                );
            } catch (e) {
              console.warn("DEBUG: query exception for", norm, e);
            }
          }

          // Count unique normalized URLs that have at least one DB row with a page_id
          // referencing one of the upserted pages.
          let matchCount = 0;
          for (const rows of matchedByNormalized.values()) {
            if (
              rows.some(
                (r) =>
                  typeof r.page_id === "number" && pageIdSet.has(r.page_id),
              )
            ) {
              matchCount++;
            }
          }
          imagesAlreadyAssociatedCount = matchCount;
          const totalMatches = Array.from(matchedByNormalized.values()).reduce(
            (acc, v) => acc + v.length,
            0,
          );
          console.log(
            `DEBUG: total DB rows matched by ilike queries = ${totalMatches}`,
          );
          console.log(
            `DEBUG: imagesAlreadyAssociatedCount = ${imagesAlreadyAssociatedCount}`,
          );
        }
      } catch (e) {
        console.warn(
          "DEBUG: failed to compute imagesAlreadyAssociatedCount:",
          e,
        );
      }

      if (imagesToInsert.length > 0) {
        // Manual retry loop for image inserts
        let insertResult: SupabaseResult<unknown> = { data: null, error: null };
        {
          let attempts = 0;
          while (attempts < 3) {
            try {
              const res = await supabase!
                .from(imagesTable)
                .insert(imagesToInsert);
              insertResult = res as SupabaseResult<unknown>;
              if (!res.error) break;
            } catch (err) {
              insertResult = {
                error: err,
                data: null,
              } as SupabaseResult<unknown>;
            }
            attempts++;
            if (attempts < 3) await new Promise((r) => setTimeout(r, 500));
          }
        }
        const { error: insertImagesError } =
          insertResult as SupabaseResult<unknown>;
        if (insertImagesError) {
          console.error("Error bulk inserting images:", insertImagesError);
        }
      }
      // Compute page insert/update/skip counts for reporting
      const totalUniquePages = uniquePages.length;
      const existingCount = existingUrlSet.size;
      const insertedCount = Math.max(0, totalUniquePages - existingCount);
      const updatedCount = existingCount;
      const providedCount =
        pageUrls && pageUrls.length > 0 ? pageUrls.length : 0;
      const skippedCount =
        providedCount > 0 ? Math.max(0, providedCount - totalUniquePages) : 0;

      // Pages analyzed includes successfully processed pages plus failures
      const pagesAnalyzed = processedPages.length + pagesFailed;

      // Images: number uploaded during scraping vs DB records inserted
      const imagesUploadedCount = pendingImageRecords.length;
      const imagesDbInsertedCount = imagesToInsert.length;
      // Unique counts for reporting
      const uniqueTotalImages = uniqueAllImageUrls.size;
      const uniqueUnsupported = uniqueUnsupportedImageUrls.size;
      const uniqueAllowed = uniqueAllowedImageUrls.size;
      const uniqueSkipped = Array.from(uniqueAllowedImageUrls).filter((u) =>
        allExistingImageUrls.has(u),
      ).length;

      // Print a concise, professional summary box with clear separation
      const lines: string[] = [];
      lines.push("Scraping Completed");
      lines.push("");
      // Pages section
      if (providedCount > 0) {
        lines.push(`Pages provided: ${providedCount}`);
      }
      lines.push(`Pages analyzed: ${pagesAnalyzed}`);
      lines.push(`Pages inserted: ${insertedCount}`);
      lines.push(`Pages updated:  ${updatedCount}`);
      lines.push(`Pages skipped:  ${skippedCount}`);
      lines.push(`Pages failed:   ${pagesFailed}`);
      lines.push("");
      lines.push("");
      // Images section
      lines.push(`Total unique images found: ${uniqueTotalImages}`);
      lines.push(`Unsupported unique images: ${uniqueUnsupported}`);
      lines.push(`Allowed unique images: ${uniqueAllowed}`);
      lines.push(`Images uploaded (instances): ${imagesUploadedCount}`);
      lines.push(
        `Images skipped (unique): ${uniqueSkipped} (already uploaded).`,
      );
      lines.push(`Images failed: ${imagesStats.failed}`);
      lines.push("");
      lines.push("");
      lines.push(
        `New associations between pages and images: ${imagesDbInsertedCount}`,
      );
      lines.push(
        `Images already associated with pages: ${imagesAlreadyAssociatedCount}`,
      );

      // Determine box dimensions and print
      const contentWidth = Math.max(...lines.map((l) => l.length));
      const innerWidth = contentWidth + 2; // one space padding each side
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
    const { getSupabaseAdminClient } = await import("../../common");
    const supabase = getSupabaseAdminClient();
    const id = genId();

    // Insert a DB row for visibility (so `scrape_jobs` shows this in the DB)
    if (supabase) {
      const payload = {
        id,
        name: "scrape-zeroheight-project",
        status: "running",
        args: { pageUrls: pageUrls || null, password: password || null },
        started_at: new Date().toISOString(),
      } as const;
      try {
        await supabase.from("scrape_jobs").insert([payload]);
      } catch (err) {
        // If DB insert fails, log but continue with in-process job
        console.warn("Failed to insert scrape_jobs row:", err);
      }
    }

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
