import { z } from "zod";
import puppeteer from "puppeteer";
import {
  getSupabaseClient,
  getSupabaseAdminClient,
  createErrorResponse,
  createSuccessResponse,
} from "../common";
import { downloadImage, clearStorageBucket } from "../image-utils";

interface PageData {
  id: number;
  title: string;
  url: string;
  content: string | null;
  images: Array<{
    original_url: string;
    storage_path: string;
  }> | null;
}

// Reusable progress bar function
function createProgressBar(
  current: number,
  total: number,
  width: number = 20,
): string {
  const filledBars = Math.round((current / total) * width);
  const emptyBars = width - filledBars;
  const progressBar = "█".repeat(filledBars) + "░".repeat(emptyBars);
  return `[${progressBar}]`;
}

async function clearZeroheightData() {
  try {
    console.log("Clearing existing Zeroheight data...");

    const client = getSupabaseClient();
    const adminClient = getSupabaseAdminClient();

    console.log("Client available:", !!client);
    console.log("Admin client available:", !!adminClient);

    if (client && adminClient) {
      // Clear images table
      console.log("Clearing images table...");
      const { error: imagesError } = await client
        .from("images")
        .delete()
        .neq("id", 0); // Delete all rows

      if (imagesError) {
        console.error("Error clearing images table:", imagesError);
        return createErrorResponse(
          "Error clearing images table: " + imagesError.message,
        );
      } else {
        console.log("Images table cleared");
      }

      // Clear pages table
      console.log("Clearing pages table...");
      const { error: pagesError } = await client
        .from("pages")
        .delete()
        .neq("id", 0); // Delete all rows

      if (pagesError) {
        console.error("Error clearing pages table:", pagesError);
        return createErrorResponse(
          "Error clearing pages table: " + pagesError.message,
        );
      } else {
        console.log("Pages table cleared");
      }

      // Clear storage bucket
      console.log("Clearing zeroheight-images storage bucket...");
      await clearStorageBucket(adminClient || client);

      console.log("All Zeroheight data cleared successfully");
      return createSuccessResponse("Zeroheight data cleared successfully");
    } else {
      const errorMsg = "Supabase clients not available, cannot clear data";
      console.log(errorMsg);
      return createErrorResponse(errorMsg);
    }
  } catch (error) {
    console.error("Error clearing Zeroheight data:", error);
    return createErrorResponse(
      "Error clearing Zeroheight data: " + (error as Error).message,
    );
  }
}

async function scrapeZeroheightProject(url: string, password?: string) {
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

    // Add these to the main links set
    zhPageLinks.forEach((link) => allLinks.add(link));

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
      images: Array<{ src: string; alt: string; index: number }>;
    }> = [];

    console.log(`Total unique links to process: ${allLinks.size}`);

    let processedCount = 0;

    // Process each link
    for (const link of allLinks) {
      if (processedLinks.has(link)) continue;

      processedCount++;
      const progressBar = createProgressBar(processedCount, allLinks.size);
      console.log(
        `${progressBar} Processing page ${processedCount}/${allLinks.size}: ${link}`,
      );

      try {
        await page.goto(link, { waitUntil: "networkidle2", timeout: 30000 });
        processedLinks.add(link);

        const title: string = await page.title();
        const content: string = await page
          .$eval(
            ".content, .zh-content, main",
            (el: Element) => el.textContent?.trim() || "",
          )
          .catch(() => "");

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
        pageLinks.forEach((newLink) => allLinks.add(newLink));

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

        // Collect page data for bulk insertion
        pagesToInsert.push({
          url: link,
          title,
          content,
          images: allImages,
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
                  return linkUrl.hostname === host && linkUrl.href !== projUrl;
                } catch {
                  return false;
                }
              }),
          projectUrl,
          allowedHostname,
        );

        newLinks.forEach((newLink) => {
          if (!allLinks.has(newLink)) {
            allLinks.add(newLink);
            console.log(
              `Discovered new link: ${newLink} (total links now: ${allLinks.size})`,
            );
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
        .insert(
          pagesToInsert.map(({ url, title, content }) => ({
            url,
            title,
            content,
          })),
        )
        .select();

      if (bulkError) {
        console.error("Error bulk inserting pages:", bulkError);
        return createErrorResponse(
          `Error saving pages to database: ${bulkError.message}`,
        );
      }

      console.log(`Successfully inserted ${insertedPages?.length || 0} pages`);

      // Collect all images for bulk insertion
      const imagesToInsert: Array<{
        page_id: number;
        original_url: string;
        storage_path: string;
      }> = [];

      // Process images for each inserted page
      let totalImagesProcessed = 0;
      const totalImages = pagesToInsert.reduce(
        (sum, page) => sum + page.images.length,
        0,
      );

      for (let i = 0; i < pagesToInsert.length; i++) {
        const pageData = pagesToInsert[i];
        const insertedPage = insertedPages?.[i];

        if (!insertedPage?.id) {
          console.error(`No ID returned for page ${pageData.url}`);
          continue;
        }

        const pageId = insertedPage.id;

        // Process and upload images for this page
        for (const img of pageData.images) {
          totalImagesProcessed++;
          const progressBar = createProgressBar(
            totalImagesProcessed,
            totalImages,
          );
          console.log(
            `${progressBar} Processing image ${totalImagesProcessed}/${totalImages}: ${img.src.split("/").pop()}`,
          );

          if (img.src && img.src.startsWith("http")) {
            const filename = `page_${pageId}_img_${img.index}.jpg`;
            const processedFilename = `${Date.now()}_${filename}`;

            const base64Data = await downloadImage(img.src, filename);
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
                  .upload(processedFilename, file, {
                    cacheControl: "3600",
                    upsert: false,
                    contentType: "image/jpeg",
                  });
              } else {
                uploadResult = await client!.storage
                  .from("zeroheight-images")
                  .upload(processedFilename, file, {
                    cacheControl: "3600",
                    upsert: false,
                    contentType: "image/jpeg",
                  });
              }

              const { data, error } = uploadResult;

              if (error) {
                console.error(`Error uploading image ${img.src}:`, error);
              } else {
                const storagePath = data.path;

                // Collect image data for bulk insertion
                imagesToInsert.push({
                  page_id: pageId,
                  original_url: img.src,
                  storage_path: storagePath,
                });
              }
            } else {
              console.error(`Failed to download image: ${img.src}`);
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
      scrapedPages: pagesToInsert.map(({ url, title, content }) => ({
        url,
        title,
        content,
        images: [],
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

export const clearZeroheightDataTool = {
  title: "Clear Zeroheight Data",
  description:
    "Clear all Zeroheight design system data from the database and storage bucket. This removes all pages and images. Requires MCP_API_KEY for authentication.",
  inputSchema: z.object({
    apiKey: z.string().describe("MCP API key for authentication"),
  }),
  handler: async ({ apiKey }: { apiKey: string }) => {
    // Validate API key
    const expectedApiKey = process.env.MCP_API_KEY;
    if (!expectedApiKey) {
      return createErrorResponse(
        "MCP_API_KEY environment variable not configured",
      );
    }

    if (apiKey !== expectedApiKey) {
      return createErrorResponse("Invalid MCP API key provided");
    }

    return await clearZeroheightData();
  },
};

export const scrapeZeroheightProjectTool = {
  title: "Scrape Zeroheight Project",
  description:
    "Scrape the configured Zeroheight design system project and add/update page data in the database. Does not clear existing data first.",
  inputSchema: z.object({}),
  handler: async () => {
    const url = process.env.ZEROHEIGHT_PROJECT_URL;
    const password = process.env.ZEROHEIGHT_PROJECT_PASSWORD;

    if (!url) {
      return createErrorResponse(
        "Error: ZEROHEIGHT_PROJECT_URL environment variable not set",
      );
    }

    // Always perform a fresh scrape
    return await scrapeZeroheightProject(url, password);
  },
};

export const queryZeroheightDataTool = {
  title: "Query Zeroheight Data",
  description:
    "Query the cached Zeroheight design system data from the database. Supports searching by title, content, or URL, and can include image data.",
  inputSchema: z.object({
    search: z
      .string()
      .optional()
      .describe("Search term to find in page titles or content"),
    url: z.string().optional().describe("Specific page URL to retrieve"),
    includeImages: z
      .boolean()
      .optional()
      .default(true)
      .describe("Whether to include image data in the response"),
    limit: z
      .number()
      .optional()
      .default(10)
      .describe("Maximum number of results to return"),
  }),
  handler: async ({
    search,
    url,
    includeImages,
    limit,
  }: {
    search?: string;
    url?: string;
    includeImages?: boolean;
    limit?: number;
  }) => {
    const client = getSupabaseClient();
    if (!client) {
      return createErrorResponse("Error: Supabase client not configured");
    }

    // Set defaults
    const effectiveIncludeImages = includeImages ?? true;
    const effectiveLimit = limit ?? 10;

    let pages: PageData[] = [];

    if (search) {
      // Use separate queries to avoid complex OR conditions that can cause parsing issues
      const titleQuery = client
        .from("pages")
        .select("id, title, url, content, images (original_url, storage_path)")
        .ilike("title", `%${search}%`);
      const contentQuery = client
        .from("pages")
        .select("id, title, url, content, images (original_url, storage_path)")
        .ilike("content", `%${search}%`);

      const [titleResult, contentResult] = await Promise.all([
        titleQuery,
        contentQuery,
      ]);

      if (titleResult.error) {
        console.error("Error querying titles:", titleResult.error);
        return createErrorResponse(
          "Error querying data: " + titleResult.error.message,
        );
      }
      if (contentResult.error) {
        console.error("Error querying content:", contentResult.error);
        return createErrorResponse(
          "Error querying data: " + contentResult.error.message,
        );
      }

      // Combine and deduplicate results
      const allPages = [
        ...(titleResult.data || []),
        ...(contentResult.data || []),
      ];
      pages = allPages.filter(
        (page, index, self) =>
          index === self.findIndex((p) => p.id === page.id),
      );
    } else if (url) {
      // Query by URL
      const { data: urlPages, error: urlError } = await client
        .from("pages")
        .select("id, title, url, content, images (original_url, storage_path)")
        .eq("url", url)
        .limit(effectiveLimit);

      if (urlError) {
        console.error("Error querying by URL:", urlError);
        return createErrorResponse("Error querying data: " + urlError.message);
      }

      pages = urlPages || [];
    } else {
      // Get all pages with limit
      const { data: allPages, error: allError } = await client
        .from("pages")
        .select("id, title, url, content, images (original_url, storage_path)")
        .limit(effectiveLimit);

      if (allError) {
        console.error("Error querying all pages:", allError);
        return createErrorResponse("Error querying data: " + allError.message);
      }

      pages = allPages || [];
    }

    const result = pages.map((page) => ({
      url: page.url,
      title: page.title,
      content: page.content,
      images:
        effectiveIncludeImages && page.images
          ? Object.fromEntries(
              page.images.map((img) => [img.original_url, img.storage_path]),
            )
          : {},
    }));

    return createSuccessResponse(result);
  },
};
