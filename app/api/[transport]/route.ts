import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import puppeteer from 'puppeteer';
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
    const supabaseKey = process.env.SUPABASE_ACCESS_TOKEN; // Use anon key for regular operations
    if (supabaseUrl && supabaseKey) {
      supabase = createClient(supabaseUrl, supabaseKey);
    }
  }
  return supabase;
}

function getSupabaseAdminClient() {
  // Use service role key only for admin operations like creating buckets
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseKey) {
    return createClient(supabaseUrl, supabaseKey);
  }
  return null;
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
    const ext = path.extname(filename).toLowerCase();
    const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.svg' ? 'image/svg+xml' : 'image/png';
    const file = new File([buffer], filename, { type: mimeType });

    // Upload to Supabase storage
    const client = getSupabaseClient();
    if (!client) {
      console.error("Supabase client not available for image upload");
      return null;
    }

    // Ensure bucket exists - use admin client for this
    const adminClient = getSupabaseAdminClient();
    if (adminClient) {
      const { data: buckets } = await adminClient.storage.listBuckets();
      const bucketExists = buckets?.some(
        (bucket) => bucket.name === "zeroheight-images",
      );

      if (!bucketExists) {
        console.log("Creating bucket 'zeroheight-images' with admin client...");
        const { error: createError } = await adminClient.storage.createBucket(
          "zeroheight-images",
          {
            public: true,
            allowedMimeTypes: ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "image/svg+xml"],
            fileSizeLimit: 10485760, // 10MB
          },
        );
        if (createError) {
          console.error("Error creating bucket:", createError);
          return null;
        }
      }
    } else {
      console.log("Admin client not available, assuming bucket exists...");
    }

    // Upload using admin client if available, otherwise regular client
    let uploadResult;
    if (adminClient) {
      uploadResult = await adminClient.storage
        .from("zeroheight-images")
        .upload(filename, file, {
          cacheControl: "3600",
          upsert: false,
        });
    } else {
      uploadResult = await client.storage
        .from("zeroheight-images")
        .upload(filename, file, {
          cacheControl: "3600",
          upsert: false,
        });
    }

    const { data, error } = uploadResult;

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
    console.log("Starting ZeroHeight project scrape - clearing existing data first...");

    // Clear existing data before scraping
    const client = getSupabaseClient();
    const adminClient = getSupabaseAdminClient();

    if (client && adminClient) {
      // Clear images table
      console.log("Clearing images table...");
      const { error: imagesError } = await client
        .from("images")
        .delete()
        .neq("id", 0); // Delete all rows

      if (imagesError) {
        console.error("Error clearing images table:", imagesError);
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
      } else {
        console.log("Pages table cleared");
      }

      // Clear storage bucket
      console.log("Clearing zeroheight-images storage bucket...");
      try {
        // List all files in the bucket
        const { data: files, error: listError } = await adminClient.storage
          .from("zeroheight-images")
          .list();

        if (listError) {
          console.error("Error listing files in bucket:", listError);
        } else if (files && files.length > 0) {
          // Delete all files
          const fileNames = files.map(file => file.name);
          const { error: deleteError } = await adminClient.storage
            .from("zeroheight-images")
            .remove(fileNames);

          if (deleteError) {
            console.error("Error deleting files from bucket:", deleteError);
          } else {
            console.log(`Deleted ${fileNames.length} files from storage bucket`);
          }
        } else {
          console.log("No files to delete from storage bucket");
        }
      } catch (storageError) {
        console.error("Error clearing storage bucket:", storageError);
      }
    } else {
      console.log("Supabase clients not available, skipping data cleanup");
    }

    console.log("Data cleanup complete, starting scrape...");

    // Extract project URL if a page URL is provided
    const projectUrl = url.includes('/p/') ? url.split('/p/')[0] : url;

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto(projectUrl, { waitUntil: 'networkidle2' });

    // Handle password authentication if provided
    if (password) {
      await page.waitForSelector('input[type="password"], [data-testid="password-input"]', { timeout: 5000 }).catch(() => {});
      const passwordInput = await page.$('input[type="password"], [data-testid="password-input"]');
      if (passwordInput) {
        await passwordInput.type(password);
        // Try to find submit button by type first, then by text content
        let submitButton = await page.$('button[type="submit"], input[type="submit"]');
        if (!submitButton) {
          // Try to find button by text content
          const buttons = await page.$$('button');
          for (const button of buttons) {
            const text = await page.evaluate(el => el.textContent?.toLowerCase(), button);
            if (text && (text.includes('submit') || text.includes('enter') || text.includes('access') || text.includes('show password'))) {
              submitButton = button;
              break;
            }
          }
        }
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

        // Scroll to load lazy images
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Process images
        const images = await page.$$eval('img', (imgs: HTMLImageElement[]) =>
          imgs.map((img, index) => {
            let src = img.src;
            if (!src.startsWith('http')) {
              src = new URL(src, window.location.href).href;
            }
            return { src, alt: img.alt, index };
          })
        );

        // Also find background images
        const bgImages = await page.$$eval(
          '*',
          (elements, imagesLength) => {
            return elements.map((el, index) => {
              const style = window.getComputedStyle(el);
              const bg = style.backgroundImage;
              if (bg && bg.startsWith('url(')) {
                let url = bg.slice(4, -1).replace(/['"]/g, '');
                if (!url.startsWith('http')) {
                  url = new URL(url, window.location.href).href;
                }
                if (url.startsWith('http')) {
                  return { src: url, alt: '', index: imagesLength + index };
                }
              }
              return null;
            }).filter(Boolean);
          },
          images.length
        );

        const allImages = [...images, ...bgImages].filter(Boolean);

        console.log(`Found ${images.length} img tags and ${bgImages.length} background images on page ${link}`);

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
        for (const img of allImages) {
          if (!img) continue;
          console.log(`Processing image: ${img.src}`);
          if (img.src && img.src.startsWith('http')) {
            const ext = path.extname(new URL(img.src).pathname).toLowerCase();

            // Skip GIF files, but allow SVG and others
            if (ext === '.gif') continue;

            const filename = `${pageId}_${img.index}_${Date.now()}${ext || '.png'}`;
            console.log(`Uploading image ${img.src} as ${filename}`);
            const storagePath = await downloadImage(img.src, filename);
            if (storagePath) {
              console.log(`Uploaded image to ${storagePath}`);
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
            } else {
              console.log(`Failed to upload image ${img.src}`);
            }
          } else {
            console.log(`Skipping image with invalid src: ${img.src}`);
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
        description: "Scrape the configured ZeroHeight design system project and return page data as JSON. Always performs a fresh scrape and updates the database.",
        inputSchema: z.object({}),
      },
      async () => {
        const url = process.env.ZEROHEIGHT_PROJECT_URL;
        const password = process.env.ZEROHEIGHT_PROJECT_PASSWORD;
        
        if (!url) {
          return {
            content: [{ type: "text", text: "Error: ZEROHEIGHT_PROJECT_URL environment variable not set" }],
          };
        }

        // Always perform a fresh scrape
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