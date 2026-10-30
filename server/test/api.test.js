import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// Each test file gets its own database, so the real data folder is never touched
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbFile = path.join(serverRoot, 'data', 'test-api.db');
fs.rmSync(dbFile, { force: true });
process.env.DB_FILE = dbFile;

const { db } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { saveListings } = await import('../src/lib/products.js');

let server;
let base;

async function call(method, route, { body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  const res = await fetch(base + route, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, body: json, cookie: setCookie ? setCookie.split(';')[0] : null };
}

const categoryId = (slug) => db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug).id;
const productId = (externalId) =>
  db.prepare('SELECT id FROM product_index WHERE source = ? AND external_id = ?').get('jumia', externalId)?.id;
const tableNames = () => db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name);

const listing = (source, externalId, name, price, oldPrice = null) => ({
  source,
  externalId,
  url: `https://shop.example${externalId}`,
  name,
  image: null,
  price,
  oldPrice,
  discountPct: oldPrice ? Math.round((1 - price / oldPrice) * 100) : null,
  rating: 4.2,
});

let userCookie;
let freshCookie;
let adminCookie;
let phoneAId;
let phoneBId;
let phoneCId;
let cameraId;

before(async () => {
  await new Promise((resolve) => {
    server = createApp().listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;

  saveListings(
    [
      listing('jumia', '/phone-a', 'Samsung Galaxy A15 128GB Dual SIM', 17999, 21999),
      listing('jumia', '/phone-c', 'Tecno Spark 20 Pro 256GB', 16499),
    ],
    categoryId('phones-tablets')
  );
  saveListings([listing('kilimall', '/phone-b', 'Samsung Galaxy A15 128GB Dual SIM 4GB', 16990)], categoryId('phones-tablets'));
  saveListings([listing('jumia', '/tv-a', 'Hisense 43 inch Full HD Smart TV', 26500)], categoryId('tvs-audio'));

  phoneAId = productId('/phone-a');
  phoneBId = db.prepare('SELECT id FROM product_index WHERE external_id = ?').get('/phone-b').id;
  phoneCId = productId('/phone-c');
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbFile + suffix, { force: true });
});

describe('storage layout', () => {
  it('keeps one table per category and no single products table', () => {
    const tables = tableNames();
    assert.ok(tables.includes('products_phones_tablets'));
    assert.ok(tables.includes('products_tvs_audio'));
    assert.ok(tables.includes('products_uncategorised'));
    assert.ok(!tables.includes('products'));
  });
});

describe('accounts and password change', () => {
  it('signs a user up and returns a session cookie', async () => {
    const res = await call('POST', '/api/auth/signup', {
      body: { name: 'Amina Test', email: 'amina@example.com', password: 'first-password' },
    });
    assert.equal(res.status, 201);
    assert.ok(res.cookie);
    userCookie = res.cookie;
  });

  it('returns the signed-in user from /me', async () => {
    const res = await call('GET', '/api/auth/me', { cookie: userCookie });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, 'amina@example.com');
    assert.equal(res.body.user.passwordChangedAt, undefined);
  });

  it('creates an admin account for admin tests', async () => {
    const res = await call('POST', '/api/auth/signup', {
      body: { name: 'Admin Test', email: 'admin@example.com', password: 'admin-password' },
    });
    adminCookie = res.cookie;
    db.prepare(`UPDATE users SET role = 'admin' WHERE email = ?`).run('admin@example.com');
    assert.equal((await call('GET', '/api/admin/stats', { cookie: adminCookie })).status, 200);
  });

  it('rejects a password change with the wrong current password', async () => {
    const res = await call('POST', '/api/auth/password', {
      cookie: userCookie,
      body: { currentPassword: 'not-it', newPassword: 'second-password' },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /current password/i);
  });

  it('rejects a new password that is too short or the same as the old one', async () => {
    const short = await call('POST', '/api/auth/password', {
      cookie: userCookie,
      body: { currentPassword: 'first-password', newPassword: 'short' },
    });
    assert.equal(short.status, 400);

    const same = await call('POST', '/api/auth/password', {
      cookie: userCookie,
      body: { currentPassword: 'first-password', newPassword: 'first-password' },
    });
    assert.equal(same.status, 400);
  });

  it('changes the password and signs this device in again', async () => {
    const res = await call('POST', '/api/auth/password', {
      cookie: userCookie,
      body: { currentPassword: 'first-password', newPassword: 'second-password' },
    });
    assert.equal(res.status, 200);
    assert.ok(res.cookie);
    freshCookie = res.cookie;
    assert.equal((await call('GET', '/api/auth/me', { cookie: freshCookie })).status, 200);
  });

  it('ends sessions that were issued before the change', async () => {
    const res = await call('GET', '/api/auth/me', { cookie: userCookie });
    assert.equal(res.status, 401);
  });

  it('accepts only the new password at sign in', async () => {
    const old = await call('POST', '/api/auth/signin', { body: { email: 'amina@example.com', password: 'first-password' } });
    assert.equal(old.status, 401);

    const current = await call('POST', '/api/auth/signin', { body: { email: 'amina@example.com', password: 'second-password' } });
    assert.equal(current.status, 200);
    userCookie = current.cookie;
  });
});

describe('catalogue', () => {
  it('lists categories with their product counts', async () => {
    const res = await call('GET', '/api/categories');
    assert.equal(res.status, 200);
    const phones = res.body.categories.find((c) => c.slug === 'phones-tablets');
    const tvs = res.body.categories.find((c) => c.slug === 'tvs-audio');
    assert.equal(phones.productCount, 3);
    assert.equal(tvs.productCount, 1);
  });

  it('filters products by category and by search text', async () => {
    const phones = await call('GET', '/api/products?category=phones-tablets');
    assert.equal(phones.status, 200);
    assert.equal(phones.body.total, 3);
    assert.ok(phones.body.items.every((item) => item.categorySlug === 'phones-tablets'));

    const search = await call('GET', '/api/products?q=samsung');
    assert.equal(search.body.total, 2);

    const kilimall = await call('GET', '/api/products?source=kilimall');
    assert.equal(kilimall.body.total, 1);
  });

  it('returns a product with its price history', async () => {
    // The price moves once below, so the history should hold the first price and the new one
    saveListings([listing('jumia', '/phone-a', 'Samsung Galaxy A15 128GB Dual SIM', 15999, 21999)], categoryId('phones-tablets'));
    const res = await call('GET', `/api/products/${phoneAId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.product.name, 'Samsung Galaxy A15 128GB Dual SIM');
    assert.equal(res.body.history.length, 2);
  });

  it('rejects a compare request with more than four products', async () => {
    const res = await call('GET', '/api/products/compare?ids=1,2,3,4,5');
    assert.equal(res.status, 400);
  });

  it('compares two products side by side', async () => {
    const res = await call('GET', `/api/products/compare?ids=${phoneAId},${phoneBId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 2);
  });

  it('suggests the same product from another store, within its category only', async () => {
    const res = await call('GET', `/api/products/${phoneAId}/alternatives`);
    assert.equal(res.status, 200);
    assert.ok(res.body.items.some((item) => item.id === phoneBId));
    assert.ok(res.body.items.every((item) => item.categorySlug === 'phones-tablets'));
    assert.ok(res.body.items.every((item) => item.matchPct >= 40));
  });
});

describe('price tracking', () => {
  it('needs a signed-in user', async () => {
    assert.equal((await call('GET', '/api/tracking')).status, 401);
  });

  it('tracks a product with a target price', async () => {
    const res = await call('POST', '/api/tracking', {
      cookie: userCookie,
      body: { productId: phoneAId, targetPrice: 16000 },
    });
    assert.equal(res.status, 200);
  });

  it('rejects an unknown product and a bad target price', async () => {
    const unknown = await call('POST', '/api/tracking', { cookie: userCookie, body: { productId: 999999 } });
    assert.equal(unknown.status, 404);

    const bad = await call('POST', '/api/tracking', { cookie: userCookie, body: { productId: phoneAId, targetPrice: -5 } });
    assert.equal(bad.status, 400);
  });

  it('shows the current price, the previous price and whether the target was reached', async () => {
    const res = await call('GET', '/api/tracking', { cookie: userCookie });
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 1);
    const [item] = res.body.items;
    assert.equal(item.id, phoneAId);
    assert.equal(item.price, 15999);
    assert.equal(item.previousPrice, 17999);
    assert.equal(item.reachedTarget, true);
  });
});

describe('admin', () => {
  it('keeps admin routes away from ordinary users', async () => {
    assert.equal((await call('GET', '/api/admin/stats', { cookie: userCookie })).status, 403);
  });

  it('reports totals from the product index', async () => {
    const res = await call('GET', '/api/admin/stats', { cookie: adminCookie });
    assert.equal(res.body.totals.products, 4);
    assert.ok(res.body.productsBySource.some((row) => row.source === 'jumia'));
  });

  it('creates a category with its own table and keeps its slug when renamed', async () => {
    const created = await call('POST', '/api/admin/categories', { cookie: adminCookie, body: { name: 'Cameras' } });
    assert.equal(created.status, 201);
    cameraId = created.body.id;
    assert.ok(tableNames().includes('products_cameras'));

    const duplicate = await call('POST', '/api/admin/categories', { cookie: adminCookie, body: { name: 'Cameras' } });
    assert.equal(duplicate.status, 400);

    const renamed = await call('PUT', `/api/admin/categories/${cameraId}`, {
      cookie: adminCookie,
      body: { name: 'Digital Cameras' },
    });
    assert.equal(renamed.status, 200);
    const list = await call('GET', '/api/admin/categories', { cookie: adminCookie });
    const camera = list.body.categories.find((c) => c.id === cameraId);
    assert.equal(camera.name, 'Digital Cameras');
    assert.equal(camera.slug, 'cameras');
  });

  it('moves a product between categories without losing its history or tracking', async () => {
    const moved = await call('PATCH', `/api/admin/products/${phoneAId}`, {
      cookie: adminCookie,
      body: { categoryId: cameraId },
    });
    assert.equal(moved.status, 200);

    const detail = await call('GET', `/api/products/${phoneAId}`);
    assert.equal(detail.body.history.length, 2);

    const tracked = await call('GET', '/api/tracking', { cookie: userCookie });
    assert.equal(tracked.body.items.length, 1);
    assert.equal(tracked.body.items[0].categoryName, 'Digital Cameras');

    const cameras = await call('GET', '/api/products?category=cameras');
    assert.equal(cameras.body.total, 1);
  });

  it('returns 404 when moving a product that does not exist or to an unknown category', async () => {
    const missing = await call('PATCH', '/api/admin/products/999999', { cookie: adminCookie, body: { categoryId: null } });
    assert.equal(missing.status, 404);

    const badCategory = await call('PATCH', `/api/admin/products/${phoneCId}`, { cookie: adminCookie, body: { categoryId: 999 } });
    assert.equal(badCategory.status, 404);
  });

  it('deletes a category by moving its products to uncategorised first', async () => {
    const res = await call('DELETE', `/api/admin/categories/${categoryId('phones-tablets')}`, { cookie: adminCookie });
    assert.equal(res.status, 200);
    assert.ok(!tableNames().includes('products_phones_tablets'));

    const orphan = db.prepare('SELECT category_id FROM product_index WHERE id = ?').get(phoneBId);
    assert.equal(orphan.category_id, null);

    const stats = await call('GET', '/api/admin/stats', { cookie: adminCookie });
    assert.equal(stats.body.totals.products, 4);
  });

  it('deletes a product and everything attached to it', async () => {
    const res = await call('DELETE', `/api/admin/products/${phoneCId}`, { cookie: adminCookie });
    assert.equal(res.status, 200);

    const stats = await call('GET', '/api/admin/stats', { cookie: adminCookie });
    assert.equal(stats.body.totals.products, 3);
  });
});
