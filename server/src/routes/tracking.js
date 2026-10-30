import { Router } from 'express';
import { db } from '../db.js';
import { allProductsSource, JOIN_CATEGORY } from '../lib/products.js';
import { requireAuth } from '../middleware/auth.js';
import { toId } from '../utils/text.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.id, p.source, p.url, p.name, p.image,
              p.current_price AS price, p.old_price AS oldPrice, p.discount_pct AS discountPct,
              p.lowest_price AS lowestPrice, p.highest_price AS highestPrice,
              p.last_seen_at AS lastSeenAt, c.name AS categoryName,
              t.target_price AS targetPrice, t.created_at AS trackedAt,
              (SELECT price FROM price_history h WHERE h.product_id = p.id ORDER BY recorded_at DESC, id DESC LIMIT 1 OFFSET 1) AS previousPrice
       FROM tracked_products t
       JOIN ${allProductsSource()} ON p.id = t.product_id
       ${JOIN_CATEGORY}
       WHERE t.user_id = ?
       ORDER BY t.created_at DESC`
    )
    .all(req.user.id);

  const items = rows.map((row) => ({
    ...row,
    reachedTarget: row.targetPrice != null && row.price <= row.targetPrice,
  }));
  res.json({ items });
});

router.post('/', (req, res) => {
  const productId = toId(req.body.productId);
  const rawTarget = req.body.targetPrice;
  const targetPrice = rawTarget === null || rawTarget === undefined || rawTarget === '' ? null : Number(rawTarget);

  if (!productId || !db.prepare('SELECT 1 FROM product_index WHERE id = ?').get(productId)) {
    return res.status(404).json({ error: 'Product not found' });
  }
  if (targetPrice !== null && (!Number.isFinite(targetPrice) || targetPrice <= 0)) {
    return res.status(400).json({ error: 'Target price must be a positive number' });
  }

  db.prepare(
    `INSERT INTO tracked_products (user_id, product_id, target_price) VALUES (?, ?, ?)
     ON CONFLICT (user_id, product_id) DO UPDATE SET target_price = excluded.target_price`
  ).run(req.user.id, productId, targetPrice);

  res.json({ ok: true, productId, targetPrice });
});

router.delete('/:productId', (req, res) => {
  const productId = toId(req.params.productId);
  db.prepare('DELETE FROM tracked_products WHERE user_id = ? AND product_id = ?').run(req.user.id, productId);
  res.json({ ok: true });
});

export default router;
