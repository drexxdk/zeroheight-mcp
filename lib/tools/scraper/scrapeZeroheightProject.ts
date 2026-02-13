import { z } from "zod";
import puppeteer from "puppeteer";
import {
  getSupabaseClient,
  getSupabaseAdminClient,
  createErrorResponse,
  createSuccessResponse,
} from "../../common";
import { downloadImage } from "../../image-utils";
import { createProgressBar } from "./shared";

// Helper function to get URL path without host
function getUrlPath(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname + urlObj.search + urlObj.hash;
  } catch {
    return url; // Return original if parsing fails
  }
}

// Helper function to process a page and its images immediately
async function processPageAndImages(
  url: string,
  title: string,
  content: string,
  images: Array<{
    src: string;
    alt: string;
    index: number;
    originalSrc?: string;
  }>,
  client: ReturnType<typeof getSupabaseClient>,
  adminClient: ReturnType<typeof getSupabaseAdminClient>,
  allExistingImageUrls: Set<string>,
  overallProgress: {
    current: number;
    total: number;
    pagesProcessed: number;
    imagesProcessed: number;
  },
) {
  // Insert page immediately
  const { data: insertedPage, error: pageError } = await client!
    .from("pages")
    .upsert(
      {
        url,
        title,
        content,
      },
      { onConflict: "url" },
    )
    .select("id")
    .single();

  if (pageError) {
    console.error(`Error inserting page ${url}:`, pageError);
    return;
  }

  if (!insertedPage?.id) {
    console.error(`No ID returned for page ${url}`);
    return;
  }

  const pageId = insertedPage.id;

  // Process images immediately with unified progress tracking
  const totalImagesInPage = images.length;

  // Update total progress count with images from this page
  overallProgress.total += totalImagesInPage;

  for (const img of images) {
    if (img.src && img.src.startsWith("http")) {
      // Check if this image has already been processed globally
      if (allExistingImageUrls.has(img.src)) {
        const progressBar = createProgressBar(
          overallProgress.current,
          overallProgress.total,
        );
        console.log(
          `${progressBar} [${overallProgress.current}/${overallProgress.total}] 🚫 Skipping image ${img.src.split("/").pop()} - already processed`,
        );
        overallProgress.current++; // Increment current even when skipping, since it was counted in total
        continue;
      }

      overallProgress.imagesProcessed++;
      overallProgress.current++;

      const progressBar = createProgressBar(
        overallProgress.current,
        overallProgress.total,
      );
      console.log(
        `${progressBar} [${overallProgress.current}/${overallProgress.total}] 🖼️ Processing image ${overallProgress.imagesProcessed} for page: ${img.src.split("/").pop()}`,
      );

      // Create a consistent filename based on normalized image URL hash
      const crypto = await import("crypto");
      const urlHash = crypto.default
        .createHash("md5")
        .update(img.src)
        .digest("hex")
        .substring(0, 8);
      const filename = `${urlHash}.jpg`;

      // Use original URL for downloading, normalized URL for deduplication
      const downloadUrl = img.originalSrc || img.src;
      const base64Data = await downloadImage(downloadUrl, filename);
      if (base64Data) {
        const file = Buffer.from(base64Data, "base64");

        // Ensure bucket exists (only log errors)
        if (adminClient) {
          const { data: buckets, error: bucketError } =
            await adminClient.storage.listBuckets();
          if (bucketError) {
            console.error("Error listing buckets:", bucketError);
          } else {
            const bucketExists = buckets?.some(
              (bucket: { name: string }) => bucket.name === "zeroheight-images",
            );
            if (!bucketExists) {
              const { error: createError } =
                await adminClient.storage.createBucket("zeroheight-images", {
                  public: true,
                  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
                  fileSizeLimit: 10485760, // 10MB
                });
              if (createError) {
                console.error("Error creating bucket:", createError);
              }
            }
          }
        }

        // Upload using admin client if available, otherwise regular client
        let uploadResult;
        if (adminClient) {
          uploadResult = await adminClient.storage
            .from("zeroheight-images")
            .upload(filename, file, {
              cacheControl: "3600",
              upsert: true,
              contentType: "image/jpeg",
            });
        } else {
          uploadResult = await client!.storage
            .from("zeroheight-images")
            .upload(filename, file, {
              cacheControl: "3600",
              upsert: true,
              contentType: "image/jpeg",
            });
        }

        const { data, error } = uploadResult;

        if (error) {
          console.error(`Error uploading image ${downloadUrl}:`, error);
        } else {
          const storagePath = data.path;

          // Insert image record immediately
          const { error: imageError } = await client!.from("images").insert({
            page_id: pageId,
            original_url: downloadUrl,
            storage_path: storagePath,
          });

          if (imageError) {
            console.error(
              `Error inserting image record for ${downloadUrl}:`,
              imageError,
            );
          } else {
            // Mark this image as uploaded to prevent re-processing
            allExistingImageUrls.add(img.src);
          }
        }
      } else {
        console.error(`Failed to download image: ${downloadUrl}`);
      }
    } else {
      console.error(`Invalid image source: ${img.src}`);
    }
  }
}

export async function scrapeZeroheightProject(
  url: string,
  password?: string,
  limit?: number,
  pageUrls?: string[],
) {
  try {
    console.log("Starting Zeroheight project scrape...");

    const client = getSupabaseClient();
    const adminClient = getSupabaseAdminClient();

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

    // Handle password if provided
    if (password) {
      console.log("Password provided, checking for login form...");
      const passwordInput = await page.$('input[type="password"]');
      if (passwordInput) {
        console.log("Found password input field, entering password...");
        await passwordInput.type(password);
        await page.keyboard.press("Enter");
        console.log("Password entered, waiting for login to process...");
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Check login status
        const currentUrl = page.url();
        console.log(`Current URL after password entry: ${currentUrl}`);

        // Check if password input still exists (indicates login failure)
        const passwordInputStillExists = await page.$('input[type="password"]');
        if (passwordInputStillExists) {
          console.log(
            "WARNING: Password input still visible - login may have failed",
          );
        } else {
          console.log(
            "Password input no longer visible - login appears successful",
          );
        }

        // Check for error messages
        const errorText = await page.$eval("body", (body) => {
          const text = body.textContent || "";
          // Look for common error patterns
          if (
            text.toLowerCase().includes("incorrect") &&
            text.toLowerCase().includes("password")
          ) {
            return 'Found "incorrect password" error';
          }
          if (
            text.toLowerCase().includes("invalid") &&
            text.toLowerCase().includes("password")
          ) {
            return 'Found "invalid password" error';
          }
          if (
            text.toLowerCase().includes("access denied") ||
            text.toLowerCase().includes("unauthorized")
          ) {
            return "Found access denied/unauthorized message";
          }
          return null;
        });

        if (errorText) {
          console.log(`ERROR: ${errorText} - login likely failed`);
        }

        // Check for navigation elements that indicate successful login
        const navLinks = await page.$$eval(
          "nav a, .navigation a, .menu a",
          (links) => links.length,
        );
        if (navLinks) {
          console.log(`Found ${navLinks} navigation links after login attempt`);
        }
      } else {
        console.log("No password input field found on the page");
      }
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

      // Get all links on the main page
      const allRawLinks = await page.$$eval("a[href]", (links) =>
        links.map((link) => link.href),
      );
      if (allRawLinks.length) {
        console.log(`Found ${allRawLinks.length} total raw links on page`);
        console.log(`Sample raw links: ${allRawLinks.slice(0, 5).join(", ")}`);
      }

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
    const maxPages =
      pageUrls && pageUrls.length > 0 ? pageUrls.length : Infinity;

    // Unified progress tracking across pages and images
    const overallProgress = {
      current: 0,
      total: maxPages === Infinity ? allLinks.size : maxPages, // Start with known pages/links
      pagesProcessed: 0,
      imagesProcessed: 0,
    };

    let processedCount = 0;

    // Process links, discovering more as we go when no specific URLs provided
    while (processedCount < maxPages) {
      // Get the next link to process (remove it from the set)
      let link = allLinks.values().next().value;
      if (!link) break; // No more links to process
      allLinks.delete(link);

      if (processedLinks.has(link)) continue;

      try {
        await page.goto(link, { waitUntil: "networkidle2", timeout: 30000 });

        // Check for redirects and normalize URL
        const finalUrl = page.url();
        if (finalUrl !== link) {
          const progressBar = createProgressBar(
            overallProgress.current,
            overallProgress.total,
          );
          console.log(
            `${progressBar} [${overallProgress.current}/${overallProgress.total}] ↪️ Redirect detected: ${getUrlPath(link)} -> ${getUrlPath(finalUrl)}`,
          );
          if (processedLinks.has(finalUrl)) {
            console.log(
              `${progressBar} [${overallProgress.current}/${overallProgress.total}] 🚫 Skipping ${getUrlPath(link)} - final URL ${getUrlPath(finalUrl)} already processed`,
            );
            overallProgress.current++; // Increment current even when skipping, since it was counted in total
            continue;
          }
          // Use the final URL for processing instead of the original link
          link = finalUrl;
        }

        processedLinks.add(link);

        processedCount++;
        overallProgress.pagesProcessed = processedCount;
        overallProgress.current++; // Count page processing as one unit of work

        const progressBar = createProgressBar(
          overallProgress.current,
          overallProgress.total,
        );
        console.log(
          `${progressBar} [${overallProgress.current}/${overallProgress.total}] 📄 Processing page ${processedCount}: ${getUrlPath(link)}`,
        );

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

        // Process page and images immediately to avoid signed URL expiration
        await processPageAndImages(
          link,
          title,
          content,
          supportedImages,
          client!,
          adminClient,
          allExistingImageUrls,
          overallProgress,
        );

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

        // Only discover new links if we're not using specific URLs
        if (!pageUrls || pageUrls.length === 0) {
          const progressBar = createProgressBar(
            overallProgress.current,
            overallProgress.total,
          );
          console.log(
            `${progressBar} [${overallProgress.current}/${overallProgress.total}] 🔍 Discovering new links on this page (automatic mode)`,
          );
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

          newLinks.forEach((newLink) => {
            if (
              !allLinks.has(newLink) &&
              !processedLinks.has(newLink) &&
              processedCount < maxPages
            ) {
              allLinks.add(newLink);
              overallProgress.total++; // Update total to include newly discovered links
              const progressBar = createProgressBar(
                overallProgress.current,
                overallProgress.total,
              );
              console.log(
                `${progressBar} [${overallProgress.current}/${overallProgress.total}] 🔗 Discovered new link: ${getUrlPath(newLink)}`,
              );
            }
          });
        }
      } catch (e) {
        console.error(`Failed to scrape ${getUrlPath(link)}:`, e);
      }
    }

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
    await scrapeZeroheightProject(projectUrl, password, undefined, pageUrls);
    console.log("Scraping completed successfully");
    return createSuccessResponse("Scraping completed successfully");
  },
};
