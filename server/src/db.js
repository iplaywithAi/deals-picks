import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

export const db = new Database(config.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Products are stored in one table per category (products_<slug>), plus products_uncategorised.
// product_index owns every product id and records which table holds that product.
// price_history and tracked_products are single tables keyed by product id, so a product keeps its history when it moves.
export const UNCATEGORISED_TABLE = 'products_uncategorised';

export function productTableName(slug) {
  // Slugs only contain a-z, 0-9 and hyphens, so the name is safe to use as an identifier
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`Invalid category slug: ${slug}`);
  return `products_${slug.replace(/-/g, '_')}`;
}

export function createProductTable(table) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "${table}" (
      id INTEGER PRIMARY KEY REFERENCES product_index(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      url TEXT NOT NULL,
      name TEXT NOT NULL,
      image TEXT,
      category_id INTEGER,
      current_price REAL NOT NULL,
      old_price REAL,
      discount_pct REAL,
      rating REAL,
      lowest_price REAL NOT NULL,
      highest_price REAL NOT NULL,
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS "${table}_price" ON "${table}" (current_price);
    CREATE INDEX IF NOT EXISTS "${table}_discount" ON "${table}" (discount_pct);
    CREATE INDEX IF NOT EXISTS "${table}_seen" ON "${table}" (last_seen_at);
  `);
}

// Tables that do not depend on the product layout
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'Package',
  description TEXT,
  default_query TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  pages INTEGER NOT NULL DEFAULT 3,
  cron TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scrape_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER REFERENCES schedules(id) ON DELETE SET NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  query TEXT NOT NULL,
  pages INTEGER NOT NULL,
  origin TEXT NOT NULL,
  status TEXT NOT NULL,
  items_found INTEGER NOT NULL DEFAULT 0,
  items_saved INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_started ON scrape_runs (started_at);
`);

// Product tables: the schema used before per-category tables existed
const PRODUCT_LAYOUT_SQL = `
CREATE TABLE IF NOT EXISTS product_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  category_id INTEGER,
  UNIQUE (source, external_id)
);

CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES product_index(id) ON DELETE CASCADE,
  price REAL NOT NULL,
  old_price REAL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_history_product ON price_history (product_id, recorded_at);

CREATE TABLE IF NOT EXISTS tracked_products (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES product_index(id) ON DELETE CASCADE,
  target_price REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, product_id)
);
`;

const COLUMNS =
  'id, source, external_id, url, name, image, category_id, current_price, old_price, discount_pct, rating, lowest_price, highest_price, first_seen_at, last_seen_at';

function hasTable(name) {
  return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name);
}

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info("${table}")`).all().some((c) => c.name === column);
}

// Moves a database created before per-category tables into the new layout.
// Everything happens in one transaction, and the row counts are checked before it commits.
function migrateLegacyProducts() {
  const before = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  const categories = db.prepare('SELECT id, slug FROM categories').all();
  const targets = [
    ...categories.map((c) => ({ table: productTableName(c.slug), categoryId: c.id })),
    { table: UNCATEGORISED_TABLE, categoryId: null },
  ];

  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(`
        DROP INDEX IF EXISTS idx_products_category;
        DROP INDEX IF EXISTS idx_products_discount;
        DROP INDEX IF EXISTS idx_history_product;
        ALTER TABLE products RENAME TO legacy_products;
        ALTER TABLE price_history RENAME TO legacy_price_history;
        ALTER TABLE tracked_products RENAME TO legacy_tracked_products;
      `);
      db.exec(PRODUCT_LAYOUT_SQL);

      // A product whose category no longer exists goes to uncategorised
      db.exec(`UPDATE legacy_products SET category_id = NULL WHERE category_id NOT IN (SELECT id FROM categories)`);
      db.exec(`INSERT INTO product_index (id, source, external_id, category_id)
               SELECT id, source, external_id, category_id FROM legacy_products`);

      for (const target of targets) {
        createProductTable(target.table);
        const where = target.categoryId === null ? 'category_id IS NULL' : 'category_id = @categoryId';
        db.prepare(`INSERT INTO "${target.table}" (${COLUMNS}) SELECT ${COLUMNS} FROM legacy_products WHERE ${where}`).run({
          categoryId: target.categoryId,
        });
      }

      db.exec(`INSERT INTO price_history (id, product_id, price, old_price, recorded_at)
               SELECT id, product_id, price, old_price, recorded_at FROM legacy_price_history`);
      db.exec(`INSERT INTO tracked_products (user_id, product_id, target_price, created_at)
               SELECT user_id, product_id, target_price, created_at FROM legacy_tracked_products`);

      const copied = targets.reduce(
        (sum, t) => sum + db.prepare(`SELECT COUNT(*) AS n FROM "${t.table}"`).get().n,
        0
      );
      if (copied !== before) {
        throw new Error(`Product migration stopped: ${before} products before, ${copied} after. No changes were made.`);
      }

      db.exec(`
        DROP TABLE legacy_price_history;
        DROP TABLE legacy_tracked_products;
        DROP TABLE legacy_products;
      `);
    })();
    console.log(`[db] moved ${before} product(s) into per-category tables`);
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

if (hasTable('products') && !hasTable('product_index')) {
  migrateLegacyProducts();
} else {
  db.exec(PRODUCT_LAYOUT_SQL);
}

// Adds a column to an existing table without touching the rest of the data
if (!hasColumn('users', 'password_changed_at')) {
  db.exec('ALTER TABLE users ADD COLUMN password_changed_at INTEGER');
}

const DEFAULT_CATEGORIES = [
  { slug: 'phones-tablets', name: 'Phones & Tablets', icon: 'Smartphone', query: 'smartphone', description: 'Smartphones, tablets and accessories' },
  { slug: 'tvs-audio', name: 'TVs & Audio', icon: 'Tv', query: 'smart tv', description: 'Televisions, soundbars and speakers' },
  { slug: 'computing', name: 'Computing', icon: 'Laptop', query: 'laptop', description: 'Laptops, monitors and storage' },
  { slug: 'appliances', name: 'Appliances', icon: 'Refrigerator', query: 'air fryer', description: 'Kitchen and home appliances' },
  { slug: 'fashion', name: 'Fashion', icon: 'Shirt', query: 'sneakers', description: 'Shoes, clothing and bags' },
  { slug: 'home-office', name: 'Home & Office', icon: 'Armchair', query: 'office chair', description: 'Furniture, decor and office supplies' },
  { slug: 'health-beauty', name: 'Health & Beauty', icon: 'HeartPulse', query: 'skincare', description: 'Personal care, grooming and wellness' },
  { slug: 'gaming', name: 'Gaming', icon: 'Gamepad2', query: 'gaming controller', description: 'Consoles, controllers and games' },
];

function seedCategories() {
  // Check first: INSERT OR IGNORE would still consume AUTOINCREMENT ids on every boot
  const exists = db.prepare('SELECT 1 FROM categories WHERE slug = ?');
  const insert = db.prepare(
    `INSERT INTO categories (slug, name, icon, description, default_query, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  db.transaction(() => {
    DEFAULT_CATEGORIES.forEach((c, i) => {
      if (!exists.get(c.slug)) insert.run(c.slug, c.name, c.icon, c.description, c.query, i + 1);
    });
  })();
}

function seedAdmin() {
  const { email, name } = config.admin;
  const password = config.admin.password?.trim();
  if (!email || !password) return;
  const normalised = email.trim().toLowerCase();
  const hash = bcrypt.hashSync(password, 12);
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalised);

  if (existing) {
    // Make the Render variables the source of truth for the admin account
    db.prepare(`UPDATE users SET password_hash = ?, role = 'admin' WHERE id = ?`).run(hash, existing.id);
    console.log(`[db] updated admin account ${normalised}`);
    return;
  }

  db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')`).run(name, normalised, hash);
  console.log(`[db] created admin account ${normalised}`);
}
seedCategories();
for (const { slug } of db.prepare('SELECT slug FROM categories').all()) createProductTable(productTableName(slug));
createProductTable(UNCATEGORISED_TABLE);
seedAdmin();
