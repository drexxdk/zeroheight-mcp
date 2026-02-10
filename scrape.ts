import puppeteer, { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { pipeline } from 'stream';

const streamPipeline = promisify(pipeline);

interface ScrapedPage {
  url: string;
  title: string;
  content: string;
  images?: { [key: string]: string };
}

async function downloadImage(url: string, filepath: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    await streamPipeline(response.body as any, fs.createWriteStream(filepath));
  } catch (error) {
    console.error(`Error downloading ${url}:`, error);
  }
}

async function scrapeZeroHeight(url: string, password?: string): Promise<ScrapedPage[]> {
  // Ensure output directory exists
  const outputDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Use the provided URL as is
  const startUrl: string = url;

  const browser: Browser = await puppeteer.launch({
    headless: true,
  });

  const page: Page = await browser.newPage();

  await page.goto(startUrl, { waitUntil: 'networkidle2' });

  if (password) {
    await page.waitForSelector('input[type="password"], [data-testid="password-input"]', { timeout: 5000 }).catch(() => {});
    const passwordInput = await page.$('input[type="password"], [data-testid="password-input"]');
    console.log('Password input found:', !!passwordInput);
    if (passwordInput) {
      await passwordInput.type(password);
      console.log('Typed password');
      await page.keyboard.press('Enter');
      console.log('Pressed Enter');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
      console.log('After navigation');
    }
  }

  await page.waitForSelector('.sidebar, .zh-sidebar, nav', { timeout: 10000 });

  console.log('Page title:', await page.title());
  console.log('Current URL:', page.url());

  const pageLinks: string[] = await page.$$eval('a[href*="/p/"]', (links: HTMLAnchorElement[]) =>
    links.map((link: HTMLAnchorElement) => link.href).filter((href: string) => href.includes('/p/'))
  );

  console.log('Found page links:', pageLinks);

  const uniqueLinks: string[] = [...new Set(pageLinks)];

  const scrapedData: ScrapedPage[] = [];

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
        }
      }

      const pageData: ScrapedPage = {
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

  return scrapedData;
}

// Command line usage
const url: string = process.argv[2] || 'https://designsystem.lruddannelse.dk/10548dffa/p/707fb9-how-do-we-work';
const password: string = process.argv[3] || 'Design4allQ4';

scrapeZeroHeight(url, password).then((data: ScrapedPage[]) => {
  console.log(JSON.stringify(data, null, 2));
}).catch((err: Error) => {
  console.error('Error:', err);
});