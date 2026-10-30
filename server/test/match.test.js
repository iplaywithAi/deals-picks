import { test } from 'node:test';
import assert from 'node:assert/strict';
import { similarity, tokenize } from '../src/utils/match.js';
import { slugify, toId } from '../src/utils/text.js';

test('tokenize drops stop words and punctuation', () => {
  assert.deepEqual([...tokenize('The Samsung Galaxy A15, 128GB (New)')].sort(), ['128gb', 'a15', 'galaxy', 'samsung']);
});

test('similar product names score high, unrelated names score low', () => {
  const a = tokenize('Samsung Galaxy A15 128GB Dual SIM');
  const b = tokenize('Samsung Galaxy A15 128GB');
  const c = tokenize('Nike Revolution 7 Running Shoes');
  assert.ok(similarity(a, b) >= 0.6);
  assert.equal(similarity(a, c), 0);
});

test('similarity is safe for empty sets', () => {
  assert.equal(similarity(new Set(), new Set(['x'])), 0);
});

test('slugify makes URL-safe category slugs', () => {
  assert.equal(slugify('Home & Office'), 'home-and-office');
  assert.equal(slugify('  Phones & Tablets!! '), 'phones-and-tablets');
});

test('toId accepts only positive integers', () => {
  assert.equal(toId('42'), 42);
  assert.equal(toId('0'), null);
  assert.equal(toId('abc'), null);
  assert.equal(toId('1.5'), null);
});
