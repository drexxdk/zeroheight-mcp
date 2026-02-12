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

async function scrapeZeroheightProject(
  url: string,
  password?: string,
  limit?: number,
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
        } else {
          console.log("No obvious error messages found");
        }

        // Check for navigation elements that indicate successful login
        const navLinks = await page.$$eval(
          "nav a, .navigation a, .menu a",
          (links) => links.length,
        );
        console.log(`Found ${navLinks} navigation links after login attempt`);
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

    const projectUrl = url;
    const allowedHostname = new URL(projectUrl).hostname;

    console.log(`Project URL: ${projectUrl}`);
    console.log(`Allowed hostname: ${allowedHostname}`);

    // Get all links on the main page
    const allRawLinks = await page.$$eval("a[href]", (links) =>
      links.map((link) => link.href),
    );
    console.log(`Found ${allRawLinks.length} total raw links on page`);
    console.log(`Sample raw links: ${allRawLinks.slice(0, 5).join(", ")}`);

    const allLinksOnPage = await page.$$eval("a[href]", (links) =>
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
            const linkUrl = new URL(href, projectUrl);
            // Be more permissive: allow any link on the same hostname, don't exclude the exact projectUrl
            return linkUrl.hostname === allowedHostname;
          } catch {
            return false;
          }
        }),
    );

    console.log(`Found ${allLinksOnPage.length} links on main page`);

    // Also check for Zeroheight-specific page links
    const zhPageLinks = await page.$$eval('a[href*="/p/"]', (links) =>
      links
        .map((link) => link.href)
        .filter((href) => {
          try {
            const linkUrl = new URL(href, projectUrl);
            return linkUrl.hostname === allowedHostname;
          } catch {
            return false;
          }
        }),
    );
    console.log(
      `Found ${zhPageLinks.length} Zeroheight page links (/p/ pattern)`,
    );
    console.log(`Sample ZH page links: ${zhPageLinks.slice(0, 5).join(", ")}`);

    // Always include the current page in scraping
    const currentPageUrl = page.url();
    console.log(`Current page URL: ${currentPageUrl}`);

    const allLinks = new Set([
      ...allLinksOnPage,
      ...zhPageLinks,
      currentPageUrl,
    ]);
    const processedLinks = new Set<string>();

    // Collect all page data first, then bulk insert
    const pagesToInsert: Array<{
      url: string;
      title: string;
      content: string;
      images: Array<{
        src: string;
        alt: string;
        index: number;
        originalSrc?: string;
      }>;
    }> = [];

    console.log(`Total unique links to process: ${allLinks.size}`);

    let processedCount = 0;
    const maxPages = limit || Infinity;

    // Process links, discovering more as we go, until we hit the limit
    while (processedCount < maxPages) {
      // Get the next link to process (remove it from the set)
      const link = allLinks.values().next().value;
      if (!link) break; // No more links to process
      allLinks.delete(link);

      if (processedLinks.has(link)) continue;

      processedCount++;
      const totalDisplay =
        maxPages === Infinity ? allLinks.size + processedCount : maxPages;
      const progressBar = createProgressBar(
        processedCount,
        Math.min(maxPages, allLinks.size + processedCount),
      );
      console.log(
        `${progressBar} Processing page ${processedCount}/${totalDisplay}: ${link}`,
      );

      try {
        await page.goto(link, { waitUntil: "networkidle2", timeout: 30000 });
        processedLinks.add(link);

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
          if (!allLinks.has(newLink) && !processedLinks.has(newLink)) {
            allLinks.add(newLink);
          }
        });

        // Scroll to load lazy images
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
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

        // Collect page data for bulk insertion
        pagesToInsert.push({
          url: link,
          title,
          content,
          images: supportedImages,
        });

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
          projectUrl,
          allowedHostname,
        );

        newLinks.forEach((newLink) => {
          if (!allLinks.has(newLink) && !processedLinks.has(newLink)) {
            allLinks.add(newLink);
            console.log(`Discovered new link: ${newLink}`);
          }
        });
      } catch (e) {
        console.error(`Failed to scrape ${link}:`, e);
      }
    }

    console.log(`Collected ${pagesToInsert.length} pages for bulk insertion`);

    // Bulk insert all pages
    if (pagesToInsert.length > 0) {
      const { data: insertedPages, error: bulkError } = await client!
        .from("pages")
        .upsert(
          pagesToInsert.map(({ url, title, content }) => ({
            url,
            title,
            content,
            scraped_at: new Date().toISOString(),
          })),
          { onConflict: "url" },
        )
        .select();

      if (bulkError) {
        console.error("Error bulk inserting pages:", bulkError);
        return createErrorResponse(
          `Error saving pages to database: ${bulkError.message}`,
        );
      }

      console.log(`Successfully inserted ${insertedPages?.length || 0} pages`);

      // Get all existing image URLs globally to prevent duplicates
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

      // Collect all images for bulk insertion
      const imagesToInsert: Array<{
        page_id: number;
        original_url: string;
        storage_path: string;
      }> = [];

      // Calculate total unique images for progress tracking
      const uniqueImageUrls = new Set<string>();
      pagesToInsert.forEach((page) => {
        page.images.forEach((img) => {
          uniqueImageUrls.add(img.src);
        });
      });
      const totalImages = uniqueImageUrls.size;

      let totalImagesProcessed = 0;

      for (let i = 0; i < pagesToInsert.length; i++) {
        const pageData = pagesToInsert[i];
        // Find the inserted page by URL instead of assuming order
        const insertedPage = insertedPages?.find((p) => p.url === pageData.url);

        if (!insertedPage?.id) {
          console.error(`No ID returned for page ${pageData.url}`);
          continue;
        }

        const pageId = insertedPage.id;

        // Process and upload images for this page
        for (const img of pageData.images) {
          if (img.src && img.src.startsWith("http")) {
            // Check if this image has already been processed globally (using normalized URL)
            if (allExistingImageUrls.has(img.src)) {
              continue;
            }

            totalImagesProcessed++;
            const progressBar = createProgressBar(
              totalImagesProcessed,
              totalImages,
            );
            console.log(
              `${progressBar} Processing image ${totalImagesProcessed}/${totalImages}: ${img.src.split("/").pop()}`,
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
                    (bucket) => bucket.name === "zeroheight-images",
                  );
                  if (!bucketExists) {
                    const { error: createError } =
                      await adminClient.storage.createBucket(
                        "zeroheight-images",
                        {
                          public: true,
                          allowedMimeTypes: [
                            "image/jpeg",
                            "image/png",
                            "image/webp",
                          ],
                          fileSizeLimit: 10485760, // 10MB
                        },
                      );
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

                // Collect image data for bulk insertion (use original URL)
                imagesToInsert.push({
                  page_id: pageId,
                  original_url: downloadUrl,
                  storage_path: storagePath,
                });

                // Mark this image as uploaded to prevent re-processing
                allExistingImageUrls.add(img.src);
              }
            } else {
              console.error(`Failed to download image: ${downloadUrl}`);
            }
          } else {
            console.error(`Invalid image source: ${img.src}`);
          }
        }
      }

      // Bulk insert all images
      if (imagesToInsert.length > 0) {
        const { error: bulkImageError } = await client!
          .from("images")
          .insert(imagesToInsert);
        if (bulkImageError) {
          console.error("Error bulk inserting images:", bulkImageError);
        } else {
          console.log(`Successfully inserted ${imagesToInsert.length} images`);
        }
      }
    }

    const finalPageTitle = await page.title();
    await browser.close();

    const finalDebugInfo = {
      projectUrl,
      allowedHostname,
      finalPageTitle,
      totalLinksOnPage: allLinksOnPage.length,
      sampleLinks: allLinksOnPage.slice(0, 5),
      totalLinksFound: allLinks.size,
      pagesProcessed: pagesToInsert.length,
    };

    return createSuccessResponse({
      debugInfo: finalDebugInfo,
      scrapedPages: pagesToInsert.map(({ url, title, content, images }) => ({
        url,
        title,
        content,
        images: images.map((img) => ({ src: img.src, alt: img.alt })),
      })),
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
    "Scrape the configured Zeroheight design system project and add/update page data in the database. Does not clear existing data first.",
  inputSchema: z.object({
    limit: z
      .number()
      .optional()
      .describe("Maximum number of pages to scrape (for testing)"),
  }),
  handler: async ({ limit }: { limit?: number }) => {
    const url = process.env.ZEROHEIGHT_PROJECT_URL;
    const password = process.env.ZEROHEIGHT_PROJECT_PASSWORD;

    if (!url) {
      return createErrorResponse(
        "Error: ZEROHEIGHT_PROJECT_URL environment variable not set",
      );
    }

    // Always perform a fresh scrape
    const result = await scrapeZeroheightProject(url, password, limit);
    console.log("Scraping completed successfully");
    return result;
  },
};
