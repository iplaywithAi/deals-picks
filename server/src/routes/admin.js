import cron from 'node-cron';
import { Router } from 'express';
import { db } from '../db.js';
import {
  allProductsSource,
  countInCategory,
  deleteProduct,
  dropCategoryTable,
  emptyCategory,
  ensureCategoryTables,
  JOIN_CATEGORY,
  moveProduct,
  PRODUCT_COLUMNS,
} from '../lib/products.js';
import { requireAdmin } from '../middleware/auth.js';
import { listSources, SOURCES } from '../scrapers/index.js';
import { enqueueAllCategories, enqueueScrape } from '../services/scraper.js';
import { runSchedule, syncSchedules } from '../services/scheduler.js';
import { CATEGORY_ICONS, slugify, toId } from '../utils/text.js';

const router = Router();
router.use(requireAdmin);

const RUN_SELECT = `
  SELECT r.id, r.schedule_id AS scheduleId, s.name AS scheduleName, r.source, r.query, r.pages,
         r.origin, r.status, r.items_found AS itemsFound, r.items_saved AS itemsSaved, r.error,
         r.started_at AS startedAt, r.finished_at AS finishedAt,
         r.category_id AS categoryId, c.name AS categoryName
  FROM scrape_runs r
  LEFT JOIN schedules s ON s.id = r.schedule_id
  LEFT JOIN categories c ON c.id = r.category_id`;

const SCHEDULE_SELECT = `
  SELECT s.id, s.name, s.source, s.category_id AS categoryId, c.name AS categoryName,
         s.query, s.pages, s.cron, s.enabled, s.created_at AS createdAt,
         (SELECT r.status FROM scrape_runs r WHERE r.schedule_id = s.id ORDER BY r.id DESC LIMIT 1) AS lastStatus,
         (SELECT COALESCE(r.finished_at, r.started_at) FROM scrape_runs r WHERE r.schedule_id = s.id ORDER BY r.id DESC LIMIT 1) AS lastRunAt
  FROM schedules s
  LEFT JOIN categories c ON c.id = s.category_id`;

const count = (sql, ...args) => db.prepare(sql).get(...args).n;

function validateScrapeInput(body) {
  const source = String(body.source || '');
  const query = String(body.query || '').trim();
  const pages = Number(body.pages ?? 3);
  const categoryId = body.categoryId ? toId(body.categoryId) : null;

  if (!SOURCES[source]) return { error: 'Choose a valid store' };
  if (!query) return { error: 'Enter a search term' };
  if (!Number.isInteger(pages) || pages < 1 || pages > 20) return { error: 'Pages must be between 1 and 20' };
  if (body.categoryId && !categoryId) return { error: 'Invalid category' };
  if (categoryId && !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(categoryId)) {
    return { error: 'Category not found' };
  }
  return { value: { source, query, pages, categoryId } };
}

function validateSchedule(body) {
  const base = validateScrapeInput(body);
  if (base.error) return base;

  const name = String(body.name || '').trim();
  const expression = String(body.cron || '').trim();
  if (!name) return { error: 'Give the schedule a name' };
  if (!cron.validate(expression)) return { error: 'The timing is not a valid cron expression' };

  return {
    value: { ...base.value, name, cron: expression, enabled: body.enabled === false ? 0 : 1 },
  };
}

// Dashboard
router.get('/stats', (req, res) => {
  res.json({
    totals: {
      products: count('SELECT COUNT(*) AS n FROM product_index'),
      users: count('SELECT COUNT(*) AS n FROM users'),
      tracked: count('SELECT COUNT(*) AS n FROM tracked_products'),
      categories: count('SELECT COUNT(*) AS n FROM categories'),
      activeSchedules: count('SELECT COUNT(*) AS n FROM schedules WHERE enabled = 1'),
    },
    productsBySource: db
      .prepare('SELECT source, COUNT(*) AS count FROM product_index GROUP BY source ORDER BY count DESC')
      .all(),
    runsLast24h: db
      .prepare(`SELECT status, COUNT(*) AS count FROM scrape_runs WHERE started_at >= datetime('now', '-1 day') GROUP BY status`)
      .all(),
    recentRuns: db.prepare(`${RUN_SELECT} ORDER BY r.id DESC LIMIT 6`).all(),
  });
});

router.get('/sources', (req, res) => res.json({ sources: listSources(), icons: CATEGORY_ICONS }));

// Scraper: schedules
router.get('/schedules', (req, res) => {
  res.json({ schedules: db.prepare(`${SCHEDULE_SELECT} ORDER BY s.id DESC`).all() });
});

router.post('/schedules', (req, res) => {
  const { value, error } = validateSchedule(req.body);
  if (error) return res.status(400).json({ error });

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO schedules (name, source, category_id, query, pages, cron, enabled)
       VALUES (@name, @source, @categoryId, @query, @pages, @cron, @enabled)`
    )
    .run(value);
  syncSchedules();
  res.status(201).json({ id: Number(lastInsertRowid) });
});

router.put('/schedules/:id', (req, res) => {
  const id = toId(req.params.id);
  if (!id || !db.prepare('SELECT 1 FROM schedules WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Schedule not found' });
  }
  const { value, error } = validateSchedule(req.body);
  if (error) return res.status(400).json({ error });

  db.prepare(
    `UPDATE schedules
     SET name = @name, source = @source, category_id = @categoryId, query = @query,
         pages = @pages, cron = @cron, enabled = @enabled
     WHERE id = @id`
  ).run({ ...value, id });
  syncSchedules();
  res.json({ ok: true });
});

router.delete('/schedules/:id', (req, res) => {
  const id = toId(req.params.id);
  db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
  syncSchedules();
  res.json({ ok: true });
});

router.post('/schedules/:id/run', (req, res) => {
  const id = toId(req.params.id);
  const runId = id && runSchedule(id);
  if (!runId) return res.status(404).json({ error: 'Schedule not found' });
  res.status(202).json({ runId });
});

// Scraper: one-off runs
router.post('/scrape', (req, res) => {
  const { value, error } = validateScrapeInput(req.body);
  if (error) return res.status(400).json({ error });
  const runId = enqueueScrape({ ...value, origin: 'manual' });
  res.status(202).json({ runId });
});

router.post('/scrape/all', (req, res) => {
  const source = String(req.body.source || '');
  const pages = Number(req.body.pages ?? 3);
  if (!SOURCES[source]) return res.status(400).json({ error: 'Choose a valid store' });
  if (!Number.isInteger(pages) || pages < 1 || pages > 20) return res.status(400).json({ error: 'Pages must be between 1 and 20' });

  const runIds = enqueueAllCategories({ source, pages });
  if (!runIds.length) return res.status(400).json({ error: 'No categories have a default search term yet' });
  res.status(202).json({ queued: runIds.length, runIds });
});

router.get('/runs', (req, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const status = ['queued', 'running', 'success', 'failed'].includes(req.query.status) ? req.query.status : null;
  const runs = db
    .prepare(`${RUN_SELECT} ${status ? 'WHERE r.status = @status' : ''} ORDER BY r.id DESC LIMIT @limit`)
    .all({ limit, status });
  res.json({ runs });
});

// Categories
const CATEGORY_SELECT = `
  SELECT c.id, c.slug, c.name, c.icon, c.description, c.default_query AS defaultQuery, c.sort_order AS sortOrder
  FROM categories c`;

// The slug names the category's table, so it is fixed once the category exists
function validateCategory(body, existing = null) {
  const name = String(body.name || '').trim();
  const slug = existing ? existing.slug : slugify(body.slug || name);
  const icon = CATEGORY_ICONS.includes(body.icon) ? body.icon : 'Package';
  if (name.length < 2) return { error: 'Enter a category name' };
  if (!slug) return { error: 'Category name must contain letters or numbers' };
  if (!existing) {
    const clash = db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug);
    if (clash) return { error: 'Another category already uses this name' };
  }
  return {
    value: {
      name,
      slug,
      icon,
      description: String(body.description || '').trim().slice(0, 200) || null,
      defaultQuery: String(body.defaultQuery || '').trim().slice(0, 120) || null,
    },
  };
}

router.get('/categories', (req, res) => {
  const categories = db.prepare(`${CATEGORY_SELECT} ORDER BY c.sort_order, c.name`).all();
  res.json({
    categories: categories.map((c) => ({ ...c, productCount: countInCategory(c.id) })),
  });
});

router.post('/categories', (req, res) => {
  const { value, error } = validateCategory(req.body);
  if (error) return res.status(400).json({ error });
  const id = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO categories (slug, name, icon, description, default_query, sort_order)
         VALUES (@slug, @name, @icon, @description, @defaultQuery,
                 (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories))`
      )
      .run(value);
    ensureCategoryTables();
    return Number(lastInsertRowid);
  })();
  res.status(201).json({ id });
});

router.put('/categories/:id', (req, res) => {
  const id = toId(req.params.id);
  const existing = id && db.prepare('SELECT id, slug FROM categories WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Category not found' });
  const { value, error } = validateCategory(req.body, existing);
  if (error) return res.status(400).json({ error });
  db.prepare(
    `UPDATE categories SET name = @name, icon = @icon,
       description = @description, default_query = @defaultQuery WHERE id = @id`
  ).run({ ...value, id });
  res.json({ ok: true });
});

router.delete('/categories/:id', (req, res) => {
  const id = toId(req.params.id);
  if (!id || !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Category not found' });
  }
  // Products move to uncategorised first, then the table goes, then the category row.
  // The table name comes from the category row, so the row is removed last.
  db.transaction(() => {
    emptyCategory(id);
    dropCategoryTable(id);
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  })();
  res.json({ ok: true });
});

// Products
router.get('/products', (req, res) => {
  const limit = 25;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const where = [];
  const params = { limit, offset: (page - 1) * limit };
  if (req.query.q) {
    where.push('p.name LIKE @q');
    params.q = `%${String(req.query.q).trim()}%`;
  }
  if (SOURCES[req.query.source]) {
    where.push('p.source = @source');
    params.source = req.query.source;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const source = allProductsSource();
  const total = db.prepare(`SELECT COUNT(*) AS n FROM ${source} ${whereSql}`).get(params).n;
  const items = db
    .prepare(
      `${PRODUCT_COLUMNS} FROM ${source} ${JOIN_CATEGORY} ${whereSql}
       ORDER BY p.last_seen_at DESC, p.id DESC LIMIT @limit OFFSET @offset`
    )
    .all(params);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.patch('/products/:id', (req, res) => {
  const id = toId(req.params.id);
  const categoryId = req.body.categoryId === null ? null : toId(req.body.categoryId);
  if (!id || (req.body.categoryId !== null && !categoryId)) return res.status(400).json({ error: 'Invalid request' });
  if (categoryId && !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(categoryId)) {
    return res.status(404).json({ error: 'Category not found' });
  }
  if (!moveProduct(id, categoryId)) return res.status(404).json({ error: 'Product not found' });
  res.json({ ok: true });
});

router.delete('/products/:id', (req, res) => {
  deleteProduct(toId(req.params.id));
  res.json({ ok: true });
});

// Users
router.get('/users', (req, res) => {
  const term = `%${String(req.query.q || '').trim()}%`;
  const users = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.created_at AS createdAt,
              (SELECT COUNT(*) FROM tracked_products t WHERE t.user_id = u.id) AS trackedCount
       FROM users u
       WHERE u.name LIKE @term OR u.email LIKE @term
       ORDER BY u.created_at DESC
       LIMIT 200`
    )
    .all({ term });
  res.json({ users });
});

router.patch('/users/:id', (req, res) => {
  const id = toId(req.params.id);
  const role = req.body.role;
  if (!id || !['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (id === req.user.id && role !== 'admin') {
    return res.status(400).json({ error: 'You cannot remove your own admin access' });
  }
  const result = db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  if (!result.changes) return res.status(404).json({ error: 'User not found' });
  res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  const id = toId(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account here' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;
