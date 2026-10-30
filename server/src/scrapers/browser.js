import puppeteer from 'puppeteer';
import { config } from '../config.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Images, fonts and styles are not needed to read prices
const BLOCKED_RESOURCES = new Set(['image',  'media']);

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withBrowser(task) {
  const browser = await puppeteer.launch({
    headless: config.scraper.headless,
    executablePath: config.scraper.chromePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    return await task(browser);
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function openPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  await page.setViewport({ width: 1366, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', (req) => (BLOCKED_RESOURCES.has(req.resourceType()) ? req.abort() : req.continue()));
  return page;
}

// Scrolls to the bottom so lazy-loaded product cards render
export async function autoScroll(page) {
  try {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let total = 0;
        const distance = 400;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          total += distance;
          if (total >= document.body.scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 200);
      });
    });
    await sleep(1000);
  } catch {
    // Lazy loading is best effort; keep whatever rendered
  }
}
