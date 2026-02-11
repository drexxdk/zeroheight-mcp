import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

// Helper function to clear directory
function clearDirectory(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        clearDirectory(filePath);
        fs.rmdirSync(filePath);
      } else {
        fs.unlinkSync(filePath);
      }
    }
  }
}

// Type definitions
interface PageData {
  id: number;
  title: string;
  url: string;
  content: string;
  scraped_at: string;
  image_data?: string;
}

interface ImageData {
  id: number;
  page_id: number;
  original_url: string;
  local_path: string;
}

interface QueryResult {
  id: number;
  title: string;
  url: string;
  content: string;
  scraped_at: string;
  images?: Array<{
    original_url: string;
    local_path: string;
    exists: boolean;
  }>;
}

async function downloadImage(url: string, filepath: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));
  } catch (error) {
    console.error(`Error downloading ${url}:`, error);
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

        // Ensure output directory exists and is clear
        const outputDir = path.join(process.cwd(), 'output');
        clearDirectory(outputDir);
        fs.mkdirSync(outputDir, { recursive: true });

        const dbPath = path.join(outputDir, 'zeroheight.db');
        const db = new Database(dbPath);

        // Check if we have cached data
        const pageCount = db.prepare('SELECT COUNT(*) as count FROM pages').get() as { count: number };
        
        if (pageCount.count > 0) {
          // Return cached data
          const pages = db.prepare(`
            SELECT p.id, p.title, p.url, p.content, 
                   GROUP_CONCAT(i.original_url || '|' || i.local_path) as image_data
            FROM pages p 
            LEFT JOIN images i ON p.id = i.page_id 
            GROUP BY p.id
          `).all() as PageData[];

          const result = pages.map(page => ({
            url: page.url,
            title: page.title,
            content: page.content,
            images: page.image_data ? Object.fromEntries(
              page.image_data.split(',').map((img: string) => {
                const [url, localPath] = img.split('|');
                return [url, localPath];
              })
            ) : {}
          }));

          db.close();
          
          return {
            content: [{ type: "text", text: `Using cached data (${result.length} pages):\n${JSON.stringify(result, null, 2)}` }],
          };
        }

        // No cached data, need to scrape
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

          // Check if password is required
          if (password) {
            // Wait for password input or modal
            await page.waitForSelector('input[type="password"], [data-testid="password-input"]', { timeout: 5000 }).catch(() => {});
            const passwordInput = await page.$('input[type="password"], [data-testid="password-input"]');
            if (passwordInput) {
              await passwordInput.type(password);
              // Look for submit button
              const submitButton = await page.$('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Enter")');
              if (submitButton) {
                await submitButton.click();
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
              }
            }
          }

          // Wait for the main content to load
          await page.waitForSelector('.sidebar, .zh-sidebar, nav', { timeout: 10000 });

          // Get all page links
          const pageLinks = await page.$$eval('a[href*="/p/"]', links =>
            links.map(link => link.href).filter(href => href.includes('/p/'))
          );

          const uniqueLinks = [...new Set(pageLinks)];

          // Create tables if they don't exist
          db.exec(`
            CREATE TABLE IF NOT EXISTS pages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              url TEXT UNIQUE,
              title TEXT,
              content TEXT,
              scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS images (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              page_id INTEGER,
              original_url TEXT,
              local_path TEXT,
              FOREIGN KEY (page_id) REFERENCES pages (id)
            );
          `);

          const scrapedData = [];

          // Scrape each page
          for (const link of uniqueLinks) {
            try {
              await page.goto(link, { waitUntil: 'networkidle2' });
              const title: string = await page.title();
              const content: string = await page.$eval('.content, .zh-content, main', (el: Element) => el.textContent?.trim() || '').catch(() => '');

              // Get all images on the page
              const images = await page.$$eval('img', (imgs: HTMLImageElement[]) => 
                imgs.map((img, index) => ({ src: img.src, alt: img.alt, index }))
              );

              // Insert page into database
              const insertPage = db.prepare('INSERT OR REPLACE INTO pages (url, title, content) VALUES (?, ?, ?)');
              const result = insertPage.run(link, title, content);
              const pageId = result.lastInsertRowid as number;

              // Download images and save to database
              const imageMap: { [key: string]: string } = {};
              for (const img of images) {
                if (img.src && img.src.startsWith('http')) {
                  const ext = path.extname(new URL(img.src).pathname).toLowerCase();
                  
                  // Skip GIF and SVG files
                  if (ext === '.gif' || ext === '.svg') {
                    continue;
                  }
                  
                  const filename = `image_${Date.now()}_${img.index}${ext || '.png'}`;
                  const filepath = path.join(outputDir, filename);
                  
                  await downloadImage(img.src, filepath);
                  
                  // Save to database
                  const insertImage = db.prepare('INSERT INTO images (page_id, original_url, local_path) VALUES (?, ?, ?)');
                  insertImage.run(pageId, img.src, `./output/${filename}`);
                  
                  // Map original URL to local path
                  imageMap[img.src] = `./output/${filename}`;
                }
              }

              const pageData = {
                url: link,
                title,
                content,
                images: imageMap
              };

              scrapedData.push(pageData);

            } catch (e) {
              console.error(`Failed to scrape ${link}:`, e);
            }
          }

          await browser.close();
          db.close();

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
    );

    server.registerTool(
      "query_zeroheight_data",
      {
        title: "Query ZeroHeight Data",
        description: "Query the cached ZeroHeight design system data from the database. Supports searching by title, content, or URL, and can include image data.",
        inputSchema: z.object({
          search: z.string().optional().describe("Search term to find in page titles or content"),
          url: z.string().optional().describe("Specific page URL to retrieve"),
          includeImages: z.boolean().optional().default(false).describe("Whether to include image data in the response"),
          limit: z.number().optional().default(10).describe("Maximum number of results to return"),
        }),
      },
      async ({ search, url, includeImages = false, limit = 10 }) => {
        const outputDir = path.join(process.cwd(), 'output');
        const dbPath = path.join(outputDir, 'zeroheight.db');

        if (!fs.existsSync(dbPath)) {
          return {
            content: [{ type: "text", text: "Error: No database found. Please run the scraping tool first." }],
          };
        }

        const db = new Database(dbPath);

        try {
          let query: string;
          let params: (string | number)[] = [];

          if (url) {
            // Query specific URL
            query = `
              SELECT p.id, p.title, p.url, p.content, p.scraped_at
              FROM pages p
              WHERE p.url = ?
            `;
            params = [url];
          } else if (search) {
            // Search in title and content
            query = `
              SELECT p.id, p.title, p.url, p.content, p.scraped_at
              FROM pages p
              WHERE p.title LIKE ? OR p.content LIKE ?
              ORDER BY p.title
              LIMIT ?
            `;
            params = [`%${search}%`, `%${search}%`, limit];
          } else {
            // Return all pages
            query = `
              SELECT p.id, p.title, p.url, p.content, p.scraped_at
              FROM pages p
              ORDER BY p.title
              LIMIT ?
            `;
            params = [limit];
          }

          const pages = db.prepare(query).all(...params) as QueryResult[];

          if (pages.length === 0) {
            db.close();
            return {
              content: [{ type: "text", text: `No pages found matching the criteria.` }],
            };
          }

          const results = [];

          for (const page of pages) {
            const pageData: QueryResult = {
              id: page.id,
              title: page.title,
              url: page.url,
              content: page.content,
              scraped_at: page.scraped_at,
            };

            if (includeImages) {
              // Get images for this page
              const images = db.prepare(`
                SELECT original_url, local_path
                FROM images
                WHERE page_id = ?
              `).all(page.id) as Pick<ImageData, 'original_url' | 'local_path'>[];

              if (images.length > 0) {
                pageData.images = images.map(img => ({
                  original_url: img.original_url,
                  local_path: img.local_path,
                  // Check if local file exists
                  exists: fs.existsSync(path.join(process.cwd(), img.local_path))
                }));
              }
            }

            results.push(pageData);
          }

          db.close();

          return {
            content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
          };
        } catch (error) {
          db.close();
          console.error('Query error:', error);
          return {
            content: [{ type: "text", text: `Error querying database: ${error instanceof Error ? error.message : String(error)}` }],
          };
        }
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

export { handler as GET, handler as POST };