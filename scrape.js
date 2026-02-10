const puppeteer = require('puppeteer');

async function scrapeZeroHeight(url, password) {
  // Use the provided URL as is
  const startUrl = url;

  const browser = await puppeteer.launch({
    headless: true,
  });

  const page = await browser.newPage();

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

  const pageLinks = await page.$$eval('a[href*="/p/"]', links =>
    links.map(link => link.href).filter(href => href.includes('/p/'))
  );

  console.log('Found page links:', pageLinks);

  const uniqueLinks = [...new Set(pageLinks)];

  const scrapedData = [];

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

  return scrapedData;
}

const url = 'https://designsystem.lruddannelse.dk/10548dffa/p/707fb9-how-do-we-work';
const password = 'Design4allQ4';

scrapeZeroHeight(url, password).then(data => {
  console.log(JSON.stringify(data, null, 2));
}).catch(err => {
  console.error('Error:', err);
});