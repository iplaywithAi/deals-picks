import { db, createProductTable, productTableName, UNCATEGORISED_TABLE } from '../db.js';

// Every column of a product table, in the order they are written
export const COLUMNS =
  'id, source, external_id, url, name, image, category_id, current_price, old_price, discount_pct, rating, lowest_price, highest_price, first_seen_at, last_seen_at';

// Columns for the API, camelCase to match the frontend. Use with productSource() or allProductsSource().
export const PRODUCT_COLUMNS = `
  SELECT p.id, p.source, p.url, p.name, p.image,
         p.current_price AS price, p.old_price AS oldPrice, p.discount_pct AS discountPct,
         p.rating, p.lowest_price AS lowestPrice, p.highest_price AS highestPrice,
         p.last_seen_at AS lastSeenAt, p.category_id AS categoryId,
         c.name AS categoryName, c.slug AS categorySlug`;

export const JOIN_CATEGORY = 'LEFT JOIN categories c ON c.id = p.category_id';

// The table holding a category's products (null category means uncategorised). Null when the category does not exist.
export function tableForCategory(categoryId) {
  if (categoryId === null || categoryId === undefined) return UNCATEGORISED_TABLE;
  const row = db.prepare('SELECT slug FROM categories WHERE id = ?').get(categoryId);
  return row ? productTableName(row.slug) : null;
}

export function categoryTables() {
  const rows = db.prepare('SELECT id, slug FROM categories ORDER BY sort_order, name').all();
  return [
    ...rows.map((r) => ({ table: productTableName(r.slug), categoryId: r.id })),
    { table: UNCATEGORISED_TABLE, categoryId: null },
  ];
}

// Makes sure every category has its table, for example after a category is added
export function ensureCategoryTables() {
  for (const { table } of categoryTables()) createProductTable(table);
}

// FROM fragment that reads every product table as one relation, aliased p
export function allProductsSource() {
  const union = categoryTables()
    .map(({ table }) => `SELECT ${COLUMNS} FROM "${table}"`)
    .join(' UNION ALL ');
  return `(${union}) p`;
}

// FROM fragment for one category's table, aliased p. Null when the category does not exist.
export function categorySource(categoryId) {
  const table = tableForCategory(categoryId);
  return table ? `"${table}" p` : null;
}

// Looks a product up by id across all tables. Returns { id, categoryId, table, row } or null.
export function findProductRow(id) {
  const index = db.prepare('SELECT id, category_id AS categoryId FROM product_index WHERE id = ?').get(id);
  if (!index) return null;
  const table = tableForCategory(index.categoryId);
  const row = db.prepare(`SELECT ${COLUMNS} FROM "${table}" WHERE id = ?`).get(id);
  return row ? { id, categoryId: index.categoryId, table, row } : null;
}

export function countInCategory(categoryId) {
  const table = tableForCategory(categoryId);
  return table ? db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n : 0;
}

// Moves a product into another category's table. Its price history and tracking stay as they are.
export function moveProduct(id, toCategoryId) {
  const found = findProductRow(id);
  if (!found) return false;
  const target = toCategoryId ?? null;
  if (found.categoryId === target) return true;

  const to = tableForCategory(target);
  if (!to) throw new Error('Category not found');

  const select = COLUMNS.split(', ')
    .map((column) => (column === 'category_id' ? '@categoryId' : column))
    .join(', ');
  db.transaction(() => {
    db.prepare(`INSERT INTO "${to}" (${COLUMNS}) SELECT ${select} FROM "${found.table}" WHERE id = @id`).run({
      id,
      categoryId: target,
    });
    db.prepare(`DELETE FROM "${found.table}" WHERE id = ?`).run(id);
    db.prepare('UPDATE product_index SET category_id = ? WHERE id = ?').run(target, id);
  })();
  return true;
}

// Removes a product, its price history and its tracking. Foreign keys cascade from product_index.
export function deleteProduct(id) {
  return db.prepare('DELETE FROM product_index WHERE id = ?').run(id).changes > 0;
}

// Moves every product in a category to uncategorised, so the category can be deleted safely
export function emptyCategory(categoryId) {
  const table = tableForCategory(categoryId);
  if (!table) return;
  const ids = db.prepare(`SELECT id FROM "${table}"`).all().map((r) => r.id);
  for (const id of ids) moveProduct(id, null);
}

export function dropCategoryTable(categoryId) {
  const table = tableForCategory(categoryId);
  if (table && table !== UNCATEGORISED_TABLE) db.exec(`DROP TABLE IF EXISTS "${table}"`);
}

const resolveCategory = (categoryId) => {
  if (!categoryId) return null;
  return db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId) ? categoryId : null;
};

const findIndex = db.prepare('SELECT id, category_id AS categoryId FROM product_index WHERE source = ? AND external_id = ?');
const insertIndex = db.prepare('INSERT INTO product_index (source, external_id, category_id) VALUES (?, ?, ?)');
const insertHistory = db.prepare('INSERT INTO price_history (product_id, price, old_price) VALUES (?, ?, ?)');

const saveAll = db.transaction((listings, requestedCategory) => {
  let saved = 0;
  for (const listing of listings) {
    const price = listing.price;
    const values = {
      url: listing.url,
      name: listing.name,
      image: listing.image ?? null,
      price,
      oldPrice: listing.oldPrice ?? null,
      discountPct: listing.discountPct ?? null,
      rating: listing.rating ?? null,
    };
    const existing = findIndex.get(listing.source, listing.externalId);

    if (!existing) {
      const categoryId = requestedCategory;
      const id = Number(insertIndex.run(listing.source, listing.externalId, categoryId).lastInsertRowid);
      const table = tableForCategory(categoryId);
      db.prepare(
        `INSERT INTO "${table}" (${COLUMNS})
         VALUES (@id, @source, @externalId, @url, @name, @image, @categoryId, @price, @oldPrice, @discountPct,
                 @rating, @price, @price, datetime('now'), datetime('now'))`
      ).run({ ...values, id, source: listing.source, externalId: listing.externalId, categoryId, price });
      insertHistory.run(id, price, values.oldPrice);
    } else {
      // A scrape with a category assigns it. A scrape without one keeps the product's current category.
      const categoryId = requestedCategory ?? existing.categoryId;
      if (categoryId !== existing.categoryId) moveProduct(existing.id, categoryId);
      const table = tableForCategory(categoryId);
      const before = db.prepare(`SELECT current_price AS price FROM "${table}" WHERE id = ?`).get(existing.id);
      db.prepare(
        `UPDATE "${table}" SET
           url = @url, name = @name, image = COALESCE(@image, image),
           current_price = @price, old_price = @oldPrice, discount_pct = @discountPct,
           rating = COALESCE(@rating, rating),
           lowest_price = MIN(lowest_price, @price), highest_price = MAX(highest_price, @price),
           last_seen_at = datetime('now')
         WHERE id = @id`
      ).run({ ...values, id: existing.id });
      // History only grows when the price actually moves
      if (!before || before.price !== price) insertHistory.run(existing.id, price, values.oldPrice);
    }
    saved++;
  }
  return saved;
});

// Writes a scrape's listings. Each listing is matched by source and external id.
export function saveListings(listings, categoryId = null) {
  return saveAll(listings, resolveCategory(categoryId));
}
