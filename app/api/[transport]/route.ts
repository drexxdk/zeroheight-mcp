import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "scrape_zeroheight_project",
      {
        title: "Scrape ZeroHeight Project",
        description: "Scrape a ZeroHeight design system project and return page data as JSON. Provide the project URL and password if required.",
        inputSchema: z.object({
          url: z.string().url(),
          password: z.string().optional(),
        }),
      },
      async ({ url, password }) => {
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
          for (const link of uniqueLinks) {
            try {
              await page.goto(link, { waitUntil: 'networkidle2' });
              const title = await page.title();
              const content = await page.$eval('.content, .zh-content, main', el => el.textContent?.trim() || '').catch(() => '');
              scrapedData.push({
                url: link,
                title,
                content
              });
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