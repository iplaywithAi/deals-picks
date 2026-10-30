import { Router } from 'express';
import { db } from '../db.js';
import {
  allProductsSource,
  categorySource,
  countInCategory,
  findProductRow,
  JOIN_CATEGORY,
  PRODUCT_COLUMNS,
  tableForCategory,
} from '../lib/products.js';
import { similarity, tokenize } from '../utils/match.js';
import { toId } from '../utils/text.js';

const router = Router();

const SORTS = {
  newest: 'p.last_seen_at DESC, p.id DESC',
  price_asc: 'p.current_price ASC',
  price_desc: 'p.current_price DESC',
  discount: 'COALESCE(p.discount_pct, 0) DESC, p.current_price ASC',
  name: 'p.name COLLATE NOCASE ASC',
};

const clampInt = (value, fallback, min, max) => {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : Math.min(max, Math.max(min, n));
};

// Source for a request: one category's table when a slug is given, otherwise every table combined.
// Returns null when the slug names no category.
function sourceFor(categorySlug) {
  if (!categorySlug) return allProductsSource();
  const category = db.prepare('SELECT id FROM categories WHERE slug = ?').get(String(categorySlug));
  return category ? categorySource(category.id) : null;
}

router.get('/categories', (req, res) => {
  const categories = db.prepare('SELECT id, slug, name, icon, description FROM categories ORDER BY sort_order, name').all();
  res.json({
    categories: categories.map((c) => ({ ...c, productCount: countInCategory(c.id) })),
  });
});

router.get('/products', (req, res) => {
  const { category, q, source, min, max, minDiscount } = req.query;
  const sort = SORTS[req.query.sort] ? req.query.sort : 'newest';
  const page = clampInt(req.query.page, 1, 1, 100000);
  const limit = clampInt(req.query.limit, 24, 1, 60);

  const from = sourceFor(category);
  if (!from) return res.json({ items: [], total: 0, page, limit, pages: 1 });

  const where = [];
  const params = {};

  String(q || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .forEach((term, i) => {
      where.push(`p.name LIKE @term${i}`);
      params[`term${i}`] = `%${term}%`;
    });

  if (source) {
    where.push('p.source = @source');
    params.source = String(source);
  }
  if (min && !Number.isNaN(Number(min))) {
    where.push('p.current_price >= @min');
    params.min = Number(min);
  }
  if (max && !Number.isNaN(Number(max))) {
    where.push('p.current_price <= @max');
    params.max = Number(max);
  }
  if (minDiscount && !Number.isNaN(Number(minDiscount))) {
    where.push('COALESCE(p.discount_pct, 0) >= @minDiscount');
    params.minDiscount = Number(minDiscount);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { n: total } = db.prepare(`SELECT COUNT(*) AS n FROM ${from} ${JOIN_CATEGORY} ${whereSql}`).get(params);
  const items = db
    .prepare(`${PRODUCT_COLUMNS} FROM ${from} ${JOIN_CATEGORY} ${whereSql} ORDER BY ${SORTS[sort]} LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset: (page - 1) * limit });

  res.json({ items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/products/deals', (req, res) => {
  const limit = clampInt(req.query.limit, 8, 1, 40);
  const from = sourceFor(req.query.category);
  if (!from) return res.json({ items: [] });

  const items = db
    .prepare(
      `${PRODUCT_COLUMNS} FROM ${from} ${JOIN_CATEGORY}
       WHERE p.discount_pct > 0
       ORDER BY p.discount_pct DESC, p.current_price ASC
       LIMIT @limit`
    )
    .all({ limit });
  res.json({ items });
});

router.get('/products/compare', (req, res) => {
  const ids = String(req.query.ids || '')
    .split(',')
    .map(toId)
    .filter(Boolean);
  if (ids.length > 4) return res.status(400).json({ error: 'Compare up to 4 products at a time' });
  if (!ids.length) return res.json({ items: [] });

  const params = Object.fromEntries(ids.map((id, i) => [`id${i}`, id]));
  const placeholders = ids.map((_, i) => `@id${i}`).join(', ');
  const rows = db
    .prepare(`${PRODUCT_COLUMNS} FROM ${allProductsSource()} ${JOIN_CATEGORY} WHERE p.id IN (${placeholders})`)
    .all(params);

  // Keep the order the client asked for
  res.json({ items: ids.map((id) => rows.find((row) => row.id === id)).filter(Boolean) });
});

router.get('/products/:id', (req, res) => {
  const id = toId(req.params.id);
  const product = id && db.prepare(`${PRODUCT_COLUMNS} FROM ${allProductsSource()} ${JOIN_CATEGORY} WHERE p.id = ?`).get(id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const history = db
    .prepare(
      `SELECT price, old_price AS oldPrice, recorded_at AS recordedAt
       FROM price_history WHERE product_id = ?
       ORDER BY recorded_at ASC, id ASC LIMIT 500`
    )
    .all(id);

  res.json({ product, history });
});

// Listings in the same category whose names closely match, usually the same product sold elsewhere
router.get('/products/:id/alternatives', (req, res) => {
  const id = toId(req.params.id);
  const found = id && findProductRow(id);
  if (!found) return res.status(404).json({ error: 'Product not found' });
  if (found.categoryId === null) return res.json({ items: [] });

  const candidates = db
    .prepare(
      `${PRODUCT_COLUMNS} FROM "${found.table}" p ${JOIN_CATEGORY}
       WHERE p.id <> @id
       ORDER BY p.last_seen_at DESC
       LIMIT 400`
    )
    .all({ id });

  const baseTokens = tokenize(found.row.name);
  const items = candidates
    .map((candidate) => ({ ...candidate, matchPct: Math.round(similarity(baseTokens, tokenize(candidate.name)) * 100) }))
    .filter((candidate) => candidate.matchPct >= 40)
    .sort((a, b) => a.price - b.price)
    .slice(0, 8);

  res.json({ items });
});

export default router;
