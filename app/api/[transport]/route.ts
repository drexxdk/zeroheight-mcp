import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { pipeline } from 'stream';

const streamPipeline = promisify(pipeline);

async function downloadImage(url: string, filepath: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    await streamPipeline(response.body as any, fs.createWriteStream(filepath));
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
        description: "Scrape the configured ZeroHeight design system project and return page data as JSON.",
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

        // Ensure output directory exists
        const outputDir = path.join(process.cwd(), 'output');
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

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

          const scrapedData = [];

          // Scrape each page
          const scrapedData = [];

          for (const link of uniqueLinks) {
            try {
              await page.goto(link, { waitUntil: 'networkidle2' });
              const title: string = await page.title();
              let content: string = await page.$eval('.content, .zh-content, main', (el: Element) => el.textContent?.trim() || '').catch(() => '');

              // Get all images on the page
              const images = await page.$$eval('img', (imgs: HTMLImageElement[]) => 
                imgs.map((img, index) => ({ src: img.src, alt: img.alt, index }))
              );

              // Download images and update content
              const imageMap: { [key: string]: string } = {};
              for (const img of images) {
                if (img.src && img.src.startsWith('http')) {
                  const ext = path.extname(new URL(img.src).pathname) || '.png';
                  const filename = `image_${Date.now()}_${img.index}${ext}`;
                  const filepath = path.join(process.cwd(), 'output', filename);
                  
                  await downloadImage(img.src, filepath);
                  
                  // Map original URL to local path
                  imageMap[img.src] = `./output/${filename}`;
                  
                  // Replace in content (if content contains HTML, but since we're getting textContent, images are not in content)
                  // For now, just save the mapping
                }
              }

              const pageData = {
                url: link,
                title,
                content,
                images: imageMap
              };

              // Save page data as JSON
              const jsonFilename = `page_${Date.now()}_${uniqueLinks.indexOf(link)}.json`;
              const jsonPath = path.join(process.cwd(), 'output', jsonFilename);
              fs.writeFileSync(jsonPath, JSON.stringify(pageData, null, 2));

              scrapedData.push(pageData);

            } catch (e) {
              console.error(`Failed to scrape ${link}:`, e);
            }
          }

          await browser.close();

          return {
            content: [{ type: "text", text: JSON.stringify(scrapedData, null, 2) }],
          };
        } catch (error) {
          console.error('Scraping error:', error);
          return {
            content: [{ type: "text", text: `Error scraping project: ${error instanceof Error ? error.message : String(error)}` }],
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