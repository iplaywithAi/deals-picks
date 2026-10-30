/*import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { tokenize } from '../utils/match.js';
import { autoScroll, openPage, sleep } from './browser.js';
import { toListing } from './normalize.js';

const STORE = {
  key: 'kilimall',
  name: 'Kilimall',
  baseUrl: 'https://www.kilimall.co.ke',
};

// Runs inside the page. Product cards are .info-box (name in .product-title, price in .product-price).
// The product link is not inside the card, so it is taken from the nearest wrapper that holds exactly one listing link.
// If .info-box is missing, the listing links themselves are used, paired with the container that shows their price.
// JSON-LD is ignored: it can describe carousels and suggestions rather than the search results.
export function readKilimallCards() {
  const LINK = 'a[href*="/listing/"]';
  const PRICE = /KSh\s*[\d,]+(?:\.\d+)?/gi;
  const clean = (text) => String(text || '').replace(/\s+/g, ' ').trim();
  const found = [];
  const seen = new Set();

  // Badge and logistics icons are not product pictures
  const productImage = (container) =>
    [...container.querySelectorAll('img')].find(
      (img) =>
        !img.classList.contains('promo-tag') &&
        !img.classList.contains('logistics-tag') &&
        !(img.getAttribute('src') || '').includes('/c/h5/')
    ) || null;

  // The listing link for a card: inside it, or on the nearest wrapper that holds only one listing link
  const linkFor = (card) => {
    const inside = card.querySelector(LINK);
    if (inside) return inside;
    let node = card;
    for (let i = 0; i < 6 && node; i++) {
      const links = node.querySelectorAll(LINK);
      if (links.length === 1) return links[0];
      if (links.length > 1) return null;
      node = node.parentElement;
    }
    return null;
  };

  const toCard = (container, link) => {
    const text = container.innerText || '';
    const prices = text.match(PRICE);
    if (!prices) return null;
    const title = container.querySelector('.product-title');
    const img = productImage(container);
    const discount = text.match(/-\s?\d+%/);
    // textContent skips the promo badge image inside the title
    const name = clean(
      title?.textContent || link.getAttribute('title') || img?.getAttribute('alt') || link.innerText.split('\n')[0]
    );
    return {
      name,
      url: link.href,
      price: prices[0],
      oldPrice: prices[1] || null,
      discount: discount ? discount[0] : null,
      rating: null,
      ratingPercent: null,
      image: img ? img.getAttribute('data-src') || img.getAttribute('src') : null,
    };
  };

  const add = (item) => {
    if (!item || !item.name || seen.has(item.url)) return;
    seen.add(item.url);
    found.push(item);
  };

  document.querySelectorAll('.info-box, .listing-item').forEach((card) => {
    const link = linkFor(card);
    if (link) add(toCard(card, link));
  });
  if (found.length) return found;

  document.querySelectorAll(LINK).forEach((link) => {
    let container = link;
    for (let i = 0; i < 5 && container.parentElement; i++) {
      const parent = container.parentElement;
      // Stop before a container that also holds a different listing (a grid or a carousel)
      if ([...parent.querySelectorAll(LINK)].some((other) => other.href !== link.href)) break;
      container = parent;
    }
    add(toCard(container, link));
  });
  return found;
}

// Words that count as the same product type as the search. Extend this list when a category needs it.
const SYNONYMS = {
  laptop: ['notebook', 'macbook', 'chromebook', 'ultrabook', 'thinkpad', 'lenovo', 'hp', 'dell', 'asus', 'acer'],
  phone: ['smartphone', 'mobile', 'iphone', 'samsung', 'tecno', 'infinix', 'itel', 'nokia'],
  tv: ['television', 'hisense', 'samsung', 'tcl'],
};

const stem = (word) => word.replace(/s$/, '');

// A result counts when its name shares a word with the search or one of its synonyms. Empty searches keep everything.
export function matchesQuery(name, query) {
  const wanted = new Set([...tokenize(query)].map(stem));
  if (!wanted.size) return true;
  for (const word of [...wanted]) (SYNONYMS[word] || []).forEach((s) => wanted.add(stem(s)));
  return [...tokenize(name)].some((word) => wanted.has(stem(word)));
}

// Keeps the last few debug pages so a bad run can be inspected without filling the disk
function saveDebugPage(html, label) {
  const dir = path.join(path.dirname(config.dbFile), 'debug');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${label}.html`);
  fs.writeFileSync(file, html);
  const old = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.html'))
    .sort()
    .slice(0, -10);
  old.forEach((name) => fs.rmSync(path.join(dir, name), { force: true }));
  return file;
}

export const kilimall = {
  ...STORE,
  status: 'experimental',

  async scrape({ browser, query, pages, log }) {
    const listings = [];
    const seenUrls = new Set();
    const page = await openPage(browser);

    try {
      const searchUrl = `${STORE.baseUrl}/search?q=${encodeURIComponent(query)}`;

      for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
        const url = pageNumber === 1 ? searchUrl : `${searchUrl}&page=${pageNumber}`;
        log(`Kilimall page ${pageNumber}: ${url}`);

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        await autoScroll(page);

        const cards = await page.evaluate(readKilimallCards);
        const relevant = cards.filter((card) => matchesQuery(card.name, query));

        // Keep the page for inspection whenever the extraction does not produce matches
        if (!relevant.length) {
          const file = saveDebugPage(await page.content(), `kilimall-${Date.now()}`);
          const sample = cards.slice(0, 3).map((c) => `"${c.name}" ${c.price ?? ''}`).join(' | ');
          log(`Page ${pageNumber}: ${cards.length} card(s), none match "${query}". Sample: ${sample || 'none'}. HTML saved to ${file}`);
          break;
        }

        log(`Page ${pageNumber}: ${cards.length} card(s) found, ${relevant.length} match "${query}"`);

        const fresh = relevant
          .map((card) => toListing(STORE, card))
          .filter((listing) => listing && !seenUrls.has(listing.url));

        if (!fresh.length) {
          log(`No new listings on page ${pageNumber}, stopping`);
          break;
        }

        fresh.forEach((listing) => seenUrls.add(listing.url));
        listings.push(...fresh);
        log(`Page ${pageNumber}: ${fresh.length} listings`);
        await sleep(config.scraper.pageDelayMs);
      }
    } finally {
      await page.close().catch(() => {});
    }

    return listings;
  },
};*/
import { config } from '../config.js';
import { autoScroll, openPage, sleep } from './browser.js';
import { toListing } from './normalize.js';

const STORE = {
  key: 'kilimall',
  name: 'Kilimall',
  baseUrl: 'https://www.kilimall.co.ke',
};

// Runs inside the page. Each result card is a .info-box. The product link and picture sit beside the card, in the same wrapper.
export function readKilimallCards() {
  return Array.from(document.querySelectorAll('.info-box')).map((item) => {
    const text = (selector) => item.querySelector(selector)?.textContent?.trim() || null;
    const link = item.closest('a') || item.parentElement?.querySelector('a[href*="/listing/"]');
    const img = link?.querySelector('img') || item.parentElement?.querySelector('img');

    return {
      name: text('.product-title'),
      price: text('.product-price'),
      oldPrice: null,
      discount: null,
      rating: null,
      ratingPercent: null,
      url: link ? link.getAttribute('href') : null,
      image: img ? img.getAttribute('data-src') || img.getAttribute('src') : null,
    };
  });
}

export const kilimall = {
  ...STORE,
  status: 'experimental',

  async scrape({ browser, query, pages, log }) {
    const listings = [];
    const page = await openPage(browser);

    try {
      const searchUrl = `${STORE.baseUrl}/search?q=${encodeURIComponent(query)}`;

      for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
        const url = pageNumber === 1 ? searchUrl : `${searchUrl}&page=${pageNumber}`;
        log(`Kilimall page ${pageNumber}: ${url}`);

    
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 600000 });

        if (!(await page.$('.info-box'))) {
          log(`No products on page ${pageNumber}, stopping`);
          break;
        }
      
        await autoScroll(page);
        const cards = await page.evaluate(readKilimallCards);
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
