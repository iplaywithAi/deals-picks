import { config } from '../config.js';
import { autoScroll, openPage, sleep } from './browser.js';
import { toListing } from './normalize.js';

const STORE = {
  key: 'jumia',
  name: 'Jumia',
  baseUrl: 'https://www.jumia.co.ke',
};

// Runs inside the page. Selectors are the ones from the original jumia_scraper.js.
export function readJumiaCards() {
  return Array.from(document.querySelectorAll('article.prd')).map((item) => {
    const text = (selector) => item.querySelector(selector)?.textContent?.trim() || null;
    const rating = item.querySelector('.stars._s');
    const widthMatch = rating?.querySelector('.in')?.getAttribute('style')?.match(/width:\s*(\d+)%/);
    const link = item.querySelector('a.core');
    const img = item.querySelector('img.img');

    return {
      name: text('.name'),
      price: text('.prc'),
      oldPrice: text('.old'),
      discount: text('.bdg._dsct'),
      rating: rating?.childNodes[0]?.textContent?.trim() || null,
      ratingPercent: widthMatch ? parseInt(widthMatch[1], 10) : null,
      url: link ? link.getAttribute('href') : null,
      image: img ? img.getAttribute('data-src') || img.getAttribute('src') : null,
    };
  });
}

export const jumia = {
  ...STORE,
  status: 'verified',

  async scrape({ browser, query, pages, log }) {
    const listings = [];
    const page = await openPage(browser);

    try {
      const searchUrl = `${STORE.baseUrl}/catalog/?q=${encodeURIComponent(query)}`;

      for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
        const url = pageNumber === 1 ? searchUrl : `${searchUrl}&page=${pageNumber}`;
        log(`Jumia page ${pageNumber}: ${url}`);

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        if (!(await page.$('article.prd'))) {
          log(`No products on page ${pageNumber}, stopping`);
          break;
        }

        await autoScroll(page);
        const cards = await page.evaluate(readJumiaCards);
        const usable = cards.map((card) => toListing(STORE, card)).filter(Boolean);
        log(`Page ${pageNumber}: ${cards.length} cards, ${usable.length} usable`);

        listings.push(...usable);
        await sleep(config.scraper.pageDelayMs);
      }
    } finally {
      await page.close().catch(() => {});
    }

    return listings;
  },
};
