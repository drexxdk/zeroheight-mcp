import puppeteer, { Browser, Page } from 'puppeteer';
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
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));
  } catch (error) {
    console.error(`Error downloading ${url}:`, error);
  }
}

async function scrapeZeroHeight(url: string, password?: string): Promise<ScrapedPage[]> {
  // Ensure output directory exists and is clear
  const outputDir = path.join(process.cwd(), 'output');
  clearDirectory(outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  // Initialize database
  const dbPath = path.join(outputDir, 'zeroheight.db');
  const db = new Database(dbPath);

  // Create tables
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
      alt_text TEXT,
      FOREIGN KEY (page_id) REFERENCES pages (id)
    );
  `);

  // Prepare statements
  const insertPage = db.prepare('INSERT OR REPLACE INTO pages (url, title, content) VALUES (?, ?, ?)');
  const insertImage = db.prepare('INSERT INTO images (page_id, original_url, local_path, alt_text) VALUES (?, ?, ?, ?)');

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
      const content: string = await page.$eval('.content, .zh-content, main', (el: Element) => el.textContent?.trim() || '').catch(() => '');

      // Get all images on the page
      const images = await page.$$eval('img', (imgs: HTMLImageElement[]) => 
        imgs.map((img, index) => ({ src: img.src, alt: img.alt, index }))
      );

      // Insert page into database
      const pageResult = insertPage.run(link, title, content);
      const pageId = pageResult.lastInsertRowid as number;

      // Download images and save to database
      for (const img of images) {
        if (img.src && img.src.startsWith('http')) {
          const ext = path.extname(new URL(img.src).pathname).toLowerCase();
          
          // Skip GIF and SVG files
          if (ext === '.gif' || ext === '.svg') {
            continue;
          }
          
          const filename = `image_${Date.now()}_${img.index}${ext || '.png'}`;
          const filepath = path.join(process.cwd(), 'output', filename);
          
          await downloadImage(img.src, filepath);
          
          // Insert image into database
          insertImage.run(pageId, img.src, `./output/${filename}`, img.alt || '');
        }
      }

      const pageData: ScrapedPage = {
        url: link,
        title,
        content,
        images: images.reduce((map, img) => {
          if (img.src && img.src.startsWith('http')) {
            const ext = path.extname(new URL(img.src).pathname).toLowerCase();
            
            // Skip GIF and SVG files
            if (ext === '.gif' || ext === '.svg') {
              return map;
            }
            
            const filename = `image_${Date.now()}_${img.index}${ext || '.png'}`;
            map[img.src] = `./output/${filename}`;
          }
          return map;
        }, {} as { [key: string]: string })
      };

      scrapedData.push(pageData);

    } catch (e) {
      console.error(`Failed to scrape ${link}:`, e);
    }
  }

  // Close database
  db.close();

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