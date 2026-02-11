import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import path from 'path';
import { NextRequest } from 'next/server';
import { createClient } from "@supabase/supabase-js";

// Type definitions
interface ZeroHeightImage {
  original_url: string;
  storage_path: string;
}

interface ZeroHeightPage {
  url: string;
  title: string;
  content: string;
  images?: ZeroHeightImage[];
}

// Supabase client will be created when needed
let supabase: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ACCESS_TOKEN;
    if (supabaseUrl && supabaseKey) {
      supabase = createClient(supabaseUrl, supabaseKey);
    }
  }
  return supabase;
}

async function downloadImage(
  url: string,
  filename: string,
): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    const buffer = await response.arrayBuffer();
    const file = new File([buffer], filename, { type: "image/png" });

    // Upload to Supabase storage
    const client = getSupabaseClient();
    if (!client) {
      console.error("Supabase client not available for image upload");
      return null;
    }

    // Ensure bucket exists
    const { data: buckets } = await client.storage.listBuckets();
    const bucketExists = buckets?.some(
      (bucket) => bucket.name === "zeroheight-images",
    );

    if (!bucketExists) {
      const { error: createError } = await client.storage.createBucket(
        "zeroheight-images",
        {
          public: true,
          allowedMimeTypes: ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"],
          fileSizeLimit: 10485760, // 10MB
        },
      );
      if (createError) {
        console.error("Error creating bucket:", createError);
        return null;
      }
    }

    const { data, error } = await client.storage
      .from("zeroheight-images")
      .upload(filename, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("Error uploading image:", error);
      return null;
    }

    return data.path;
  } catch (error) {
    console.error("Error downloading/uploading image:", error);
    return null;
  }
}

// Authentication middleware
function authenticateRequest(request: NextRequest): { isValid: boolean; error?: string } {
  const apiKey = process.env.MCP_API_KEY;

  if (!apiKey) {
    return { isValid: false, error: "Server configuration error: MCP_API_KEY not set" };
  }

  // Check for API key in headers or query parameters
  const authHeader = request.headers.get('authorization');
  const apiKeyHeader = request.headers.get('x-api-key');
  const apiKeyQuery = request.nextUrl.searchParams.get('api_key');

  const providedKey = authHeader?.replace('Bearer ', '') || apiKeyHeader || apiKeyQuery;

  if (!providedKey) {
    return { isValid: false, error: "API key required. Provide via Authorization header (Bearer <key>), X-API-Key header, or api_key query parameter" };
  }

  if (providedKey !== apiKey) {
    return { isValid: false, error: "Invalid API key" };
  }

  return { isValid: true };
}

async function scrapeZeroHeightProject(url: string, password?: string): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    // Extract project URL if a page URL is provided
    const projectUrl = url.includes('/p/') ? url.split('/p/')[0] : url;

    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();
    await page.goto(projectUrl, { waitUntil: 'networkidle2' });

    // Handle password authentication if provided
    if (password) {
      await page.waitForSelector('input[type="password"], [data-testid="password-input"]', { timeout: 5000 }).catch(() => {});
      const passwordInput = await page.$('input[type="password"], [data-testid="password-input"]');
      if (passwordInput) {
        await passwordInput.type(password);
        const submitButton = await page.$('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Enter")');
        if (submitButton) {
          await submitButton.click();
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
        }
      }
    }

    // Wait for content to load and get page links
    await page.waitForSelector('.sidebar, .zh-sidebar, nav', { timeout: 10000 });
    const pageLinks = await page.$$eval('a[href*="/p/"]', links =>
      links.map(link => link.href).filter(href => href.includes('/p/'))
    );
    const uniqueLinks = [...new Set(pageLinks)];

    const scrapedData = [];

    // Scrape each page
    for (const link of uniqueLinks) {
      try {
        await page.goto(link, { waitUntil: 'networkidle2' });
        const title: string = await page.title();
        const content: string = await page.$eval('.content, .zh-content, main', (el: Element) => el.textContent?.trim() || '').catch(() => '');

        // Process images
        const images = await page.$$eval('img', (imgs: HTMLImageElement[]) =>
          imgs.map((img, index) => ({ src: img.src, alt: img.alt, index }))
        );

        // Save page to Supabase
        const client = getSupabaseClient();
        if (!client) {
          console.error("Supabase client not available for page saving");
          continue;
        }

        const { data: pageData, error: pageError } = await client
          .from("pages")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert({ url: link, title, content } as any, { onConflict: "url" })
          .select()
          .single();

        if (pageError) {
          console.error("Error saving page:", pageError);
          continue;
        }

        const pageId = (pageData as { id: number }).id;

        // Download and save images
        const imageMap: { [key: string]: string } = {};
        for (const img of images) {
          if (img.src && img.src.startsWith('http')) {
            const ext = path.extname(new URL(img.src).pathname).toLowerCase();

            // Skip GIF and SVG files
            if (ext === '.gif' || ext === '.svg') continue;

            const filename = `${pageId}_${img.index}_${Date.now()}${ext || '.png'}`;
            const storagePath = await downloadImage(img.src, filename);
            if (storagePath) {
              imageMap[img.src] = storagePath;

              // Save image reference to database
              await client.from("images").upsert(
                {
                  page_id: pageId,
                  original_url: img.src,
                  storage_path: storagePath,
                } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                { onConflict: "page_id,original_url" },
              );
            }
          }
        }

        scrapedData.push({
          url: link,
          title,
          content,
          images: Object.entries(imageMap).map(([original_url, storage_path]) => ({
            original_url,
            storage_path,
          })),
        });

      } catch (e) {
        console.error(`Failed to scrape ${link}:`, e);
      }
    }

    await browser.close();

    return {
      content: [{ type: "text", text: `Scraped and cached ${scrapedData.length} pages:\n${JSON.stringify(scrapedData, null, 2)}` }],
    };
  } catch (error) {
    console.error('Scraping error:', error);
    return {
      content: [{ type: "text", text: `Error scraping project: ${error instanceof Error ? error.message : String(error)}` }],
    };
  }
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "scrape_zeroheight_project",
      {
        title: "Scrape ZeroHeight Project",
        description: "Scrape the configured ZeroHeight design system project and return page data as JSON. Uses cached data when available.",
        inputSchema: z.object({}),
      },
      async ({}) => {
        const url = process.env.ZEROHEIGHT_PROJECT_URL;
        const password = process.env.ZEROHEIGHT_PROJECT_PASSWORD;
        
        if (!url) {
          return {
            content: [{ type: "text", text: "Error: ZEROHEIGHT_PROJECT_URL environment variable not set" }],
          };
        }

        // Check if we have cached data in Supabase
        const client = getSupabaseClient();
        if (!client) {
          return {
            content: [
              { type: "text", text: "Error: Supabase client not configured" },
            ],
          };
        }

        const { data: pages, error: countError } = await client
          .from("pages")
          .select("id", { count: "exact" });

        if (countError) {
          console.error("Error checking cached data:", countError);
        }

        if (pages && pages.length > 0) {
          // Return cached data
          const { data: cachedPages, error: fetchError } = await client.from(
            "pages",
          ).select(`
              id,
              title,
              url,
              content,
              images (
                original_url,
                storage_path
              )
            `) as { data: ZeroHeightPage[] | null, error: Error | null };

          if (fetchError) {
            console.error("Error fetching cached data:", fetchError);
            return await scrapeZeroHeightProject(url, password);
          }

          const result =
            cachedPages?.map((page) => ({
              url: page.url,
              title: page.title,
              content: page.content,
              images: page.images
                ? Object.fromEntries(
                    page.images.map((img) => [
                      img.original_url,
                      img.storage_path,
                    ]),
                  )
                : {},
            })) || [];

          return {
            content: [
              {
                type: "text",
                text: `Using cached data (${result.length} pages):\n${JSON.stringify(result, null, 2)}`,
              },
            ],
          };
        }

        // No cached data, need to scrape
        return await scrapeZeroHeightProject(url, password);
      }
    );

    server.registerTool(
      "query_zeroheight_data",
      {
        title: "Query ZeroHeight Data",
        description: "Query the cached ZeroHeight design system data from the database. Supports searching by title, content, or URL, and can include image data.",
        inputSchema: z.object({
          search: z.string().optional().describe("Search term to find in page titles or content"),
          url: z.string().optional().describe("Specific page URL to retrieve"),
          includeImages: z.boolean().optional().default(true).describe("Whether to include image data in the response"),
          limit: z.number().optional().default(10).describe("Maximum number of results to return"),
        }),
      },
      async ({ search, url, includeImages = false, limit = 10 }) => {
        const client = getSupabaseClient();
        if (!client) {
          return {
            content: [
              { type: "text", text: "Error: Supabase client not configured" },
            ],
          };
        }

        let query = client.from("pages").select(`
            id,
            title,
            url,
            content,
            images (
              original_url,
              storage_path
            )
          `);

        if (search) {
          query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
        }

        if (url) {
          query = query.eq("url", url);
        }

        query = query.limit(limit);

        const { data: pages, error } = await query as { data: ZeroHeightPage[] | null, error: Error | null };

        if (error) {
          console.error("Error querying data:", error);
          return {
            content: [
              { type: "text", text: `Error querying data: ${error.message}` },
            ],
          };
        }

        const result =
          pages?.map((page) => ({
            url: page.url,
            title: page.title,
            content: page.content,
            images:
              includeImages && page.images
                ? Object.fromEntries(
                    page.images.map((img) => [
                      img.original_url,
                      img.storage_path,
                    ]),
                  )
                : {},
          })) || [];

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }
    );
  },
  {},
  {
    basePath: "/api",
    maxDuration: 300, // 5 minutes for scraping
    verboseLogs: true,
  }
);

// Authentication wrapper for Next.js API routes
async function authenticatedHandler(request: NextRequest) {
  const auth = authenticateRequest(request);

  if (!auth.isValid) {
    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32600,
        message: auth.error
      },
      id: null
    }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  // Call the MCP handler with the authenticated request
  return handler(request);
}

export { authenticatedHandler as GET, authenticatedHandler as POST };