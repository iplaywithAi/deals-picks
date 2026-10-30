// Runs the in-page extraction against local fixtures in a real Chromium.
// Set CHROME_PATH to enable these tests; they are skipped otherwise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { readJumiaCards } from '../src/scrapers/jumia.js';
import { readKilimallCards } from '../src/scrapers/kilimall.js';
import { toListing } from '../src/scrapers/normalize.js';

const CHROME = process.env.CHROME_PATH;
const skip = !CHROME && 'set CHROME_PATH to run browser tests';

const JUMIA_FIXTURE = `
<html><body><div class="osh-grid">
  <article class="prd _hov">
    <a class="core" href="/samsung-galaxy-a15-128gb-123456.html">
      <div class="img-c"><img class="img" data-src="https://img.example/a15.jpg" src="placeholder.gif"></div>
      <h3 class="name">Samsung Galaxy A15 128GB Dual SIM</h3>
      <div class="prc">KSh 17,999</div>
      <div class="old">KSh 21,999</div>
      <div class="bdg _dsct _sm">-18%</div>
      <div class="stars _s">4.6 out of 5<div class="in" style="width:92%"></div></div>
    </a>
  </article>
  <article class="prd">
    <a class="core" href="/kettle-654321.html?ref=x">
      <img class="img" src="https://img.example/kettle.jpg">
      <h3 class="name">Ramtons 1.5L Electric Kettle</h3>
      <div class="prc">KSh 2,450</div>
    </a>
  </article>
</div></body></html>`;

const KILIMALL_FIXTURE = `
<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"ItemList","itemListElement":[
  {"@type":"ListItem","position":1,"item":{"@type":"Product","name":"Hisense 43 inch Smart TV","url":"https://www.kilimall.co.ke/product/hisense-43-smart-tv-1001",
   "image":["https://img.example/tv.jpg"],"offers":{"@type":"Offer","price":"26500","priceCurrency":"KES"}}}
]}
</script></head><body>
  <div class="grid">
    <div class="card"><a href="/product/infinix-hot-40-2002">
      <img alt="Infinix Hot 40i 128GB" src="https://img.example/inf.jpg">
      <p>Infinix Hot 40i 128GB</p><span>KSh 11,999</span><span>KSh 13,500</span><span>-11%</span>
    </a></div>
    <div class="card"><a href="/product/no-price-3003"><p>Coming soon</p></a></div>
  </div>
</body></html>`;

async function withPage(html, fn) {
  const browser = await puppeteer.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

test('Jumia selectors extract cards from a Jumia-style results page', { skip }, async () => {
  const cards = await withPage(JUMIA_FIXTURE, (page) => page.evaluate(readJumiaCards));
  assert.equal(cards.length, 2);

  const listings = cards.map((c) => toListing({ key: 'jumia', baseUrl: 'https://www.jumia.co.ke' }, c));
  assert.deepEqual(listings[0], {
    source: 'jumia',
    externalId: '/samsung-galaxy-a15-128gb-123456.html',
    url: 'https://www.jumia.co.ke/samsung-galaxy-a15-128gb-123456.html',
    name: 'Samsung Galaxy A15 128GB Dual SIM',
    image: 'https://img.example/a15.jpg',
    price: 17999,
    oldPrice: 21999,
    discountPct: 18,
    rating: 4.6,
  });
  assert.equal(listings[1].price, 2450);
  assert.equal(listings[1].url, 'https://www.jumia.co.ke/kettle-654321.html');
});

test('Kilimall extraction reads JSON-LD and falls back to KSh price links', { skip }, async () => {
  const cards = await withPage(KILIMALL_FIXTURE, (page) => page.evaluate(readKilimallCards));
  const names = cards.map((c) => c.name);
  assert.ok(names.includes('Hisense 43 inch Smart TV'), 'JSON-LD product missing');
  assert.ok(names.includes('Infinix Hot 40i 128GB'), 'DOM fallback product missing');
  assert.ok(!names.includes('Coming soon'), 'unpriced card should be ignored');

  const fallback = cards.find((c) => c.name === 'Infinix Hot 40i 128GB');
  const listing = toListing({ key: 'kilimall', baseUrl: 'https://www.kilimall.co.ke' }, fallback);
  assert.equal(listing.price, 11999);
  assert.equal(listing.oldPrice, 13500);
  assert.equal(listing.discountPct, 11);
});
