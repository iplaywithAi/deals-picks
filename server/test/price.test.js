import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiscount, parsePrice, parseRating } from '../src/utils/price.js';
import { toListing } from '../src/scrapers/normalize.js';

const STORE = { key: 'jumia', baseUrl: 'https://www.jumia.co.ke' };

test('parsePrice handles KSh text with thousands separators', () => {
  assert.equal(parsePrice('KSh 1,299'), 1299);
  assert.equal(parsePrice('KSh 17,999.50'), 17999.5);
  assert.equal(parsePrice(null), null);
  assert.equal(parsePrice('Out of stock'), null);
});

test('parseDiscount reads percentage badges', () => {
  assert.equal(parseDiscount('-25%'), 25);
  assert.equal(parseDiscount('- 12 %'), 12);
  assert.equal(parseDiscount(undefined), null);
});

test('parseRating prefers the star bar width over the text', () => {
  assert.equal(parseRating('4.5 out of 5', 90), 4.5);
  assert.equal(parseRating('4.2', null), 4.2);
  assert.equal(parseRating('(120)', null), null);
});

test('toListing builds a clean listing from a Jumia card', () => {
  const listing = toListing(STORE, {
    name: '  Samsung   Galaxy A15 128GB ',
    price: 'KSh 17,999',
    oldPrice: 'KSh 21,999',
    discount: '-18%',
    rating: '4.6',
    ratingPercent: 92,
    url: '/samsung-galaxy-a15-128gb-123456.html?ref=search',
    image: 'https://img.example/a.jpg',
  });
  assert.deepEqual(listing, {
    source: 'jumia',
    externalId: '/samsung-galaxy-a15-128gb-123456.html',
    url: 'https://www.jumia.co.ke/samsung-galaxy-a15-128gb-123456.html',
    name: 'Samsung Galaxy A15 128GB',
    image: 'https://img.example/a.jpg',
    price: 17999,
    oldPrice: 21999,
    discountPct: 18,
    rating: 4.6,
  });
});

test('toListing computes discount when the badge is missing', () => {
  const listing = toListing(STORE, { name: 'Kettle', price: 'KSh 2,450', oldPrice: 'KSh 2,999', url: '/kettle-1.html' });
  assert.equal(listing.discountPct, 18);
});

test('toListing rejects cards without a usable price, name or link', () => {
  assert.equal(toListing(STORE, { name: 'X', price: null, url: '/x.html' }), null);
  assert.equal(toListing(STORE, { name: null, price: 'KSh 100', url: '/x.html' }), null);
  assert.equal(toListing(STORE, { name: 'X', price: 'KSh 100', url: null }), null);
});
