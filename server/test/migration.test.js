import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// Builds a database in the layout used before per-category tables, then lets db.js migrate it
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbFile = path.join(serverRoot, 'data', 'test-migration.db');
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbFile + suffix, { force: true });
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

const legacy = new Database(dbFile);
// A legacy file can hold a product whose category was already removed, so the fixture allows that row
legacy.pragma('foreign_keys = OFF');
legacy.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'Package',
    description TEXT,
    default_query TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    url TEXT NOT NULL,
    name TEXT NOT NULL,
    image TEXT,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    current_price REAL NOT NULL,
    old_price REAL,
    discount_pct REAL,
    rating REAL,
    lowest_price REAL NOT NULL,
    highest_price REAL NOT NULL,
    first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (source, external_id)
  );
  CREATE TABLE price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    price REAL NOT NULL,
    old_price REAL,
    recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE tracked_products (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    target_price REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, product_id)
  );

  INSERT INTO categories (id, slug, name, sort_order) VALUES
    (1, 'phones-tablets', 'Phones & Tablets', 1),
    (2, 'tvs-audio', 'TVs & Audio', 2);
  INSERT INTO users (id, name, email, password_hash) VALUES (1, 'Old User', 'old@example.com', 'hash');
  INSERT INTO products (id, source, external_id, url, name, category_id, current_price, old_price, lowest_price, highest_price) VALUES
    (1, 'jumia', '/p1', 'https://shop.example/p1', 'Phone one', 1, 100, 120, 95, 120),
    (2, 'jumia', '/p2', 'https://shop.example/p2', 'Phone two', 1, 200, NULL, 200, 200),
    (3, 'kilimall', '/t1', 'https://shop.example/t1', 'Soundbar', 2, 300, 350, 290, 350),
    (4, 'jumia', '/o1', 'https://shop.example/o1', 'Orphan lamp', 99, 50, NULL, 50, 50);
  INSERT INTO price_history (product_id, price, old_price, recorded_at) VALUES
    (1, 120, NULL, '2026-01-01 10:00:00'),
    (1, 100, 120, '2026-02-01 10:00:00'),
    (2, 200, NULL, '2026-01-05 10:00:00'),
    (3, 350, NULL, '2026-01-07 10:00:00'),
    (3, 300, 350, '2026-02-07 10:00:00');
  INSERT INTO tracked_products (user_id, product_id, target_price) VALUES (1, 1, 90), (1, 3, NULL);
`);
legacy.close();

process.env.DB_FILE = dbFile;
const { db } = await import('../src/db.js');

const ids = (table) => db.prepare(`SELECT id FROM "${table}" ORDER BY id`).all().map((r) => r.id);
const tableNames = () => db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name);

after(() => {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbFile + suffix, { force: true });
});

describe('migrating a database from the single products table', () => {
  it('moves each product into the table for its category', () => {
    const tables = tableNames();
    assert.ok(!tables.includes('products'));
    assert.ok(!tables.some((name) => name.startsWith('legacy_')));
    assert.deepEqual(ids('products_phones_tablets'), [1, 2]);
    assert.deepEqual(ids('products_tvs_audio'), [3]);
  });

  it('sends a product with an unknown category to uncategorised', () => {
    assert.deepEqual(ids('products_uncategorised'), [4]);
    const row = db.prepare('SELECT category_id FROM product_index WHERE id = 4').get();
    assert.equal(row.category_id, null);
  });

  it('keeps product ids, price history and tracking', () => {
    assert.deepEqual(db.prepare('SELECT id FROM product_index ORDER BY id').all().map((r) => r.id), [1, 2, 3, 4]);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM price_history').get().n, 5);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM price_history WHERE product_id = 1').get().n, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tracked_products').get().n, 2);
    assert.equal(db.prepare('SELECT target_price FROM tracked_products WHERE product_id = 1').get().target_price, 90);
  });

  it('keeps the existing categories and adds the defaults that were missing', () => {
    assert.equal(db.prepare('SELECT id FROM categories WHERE slug = ?').get('phones-tablets').id, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM categories').get().n, 8);
  });

  it('adds the password change column to users', () => {
    const columns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
    assert.ok(columns.includes('password_changed_at'));
  });

  it('leaves foreign keys on with no broken references', () => {
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  });
});
