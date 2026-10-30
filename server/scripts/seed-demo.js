// Adds clearly labelled sample listings so the site can be previewed without scraping.
// Usage: npm run seed:demo            (add sample data)
//        npm run seed:demo -- --clear (remove it again)
import { db } from '../src/db.js';
import { findProductRow, saveListings } from '../src/lib/products.js';

if (process.argv.includes('--clear')) {
  // Deleting the index rows cascades to the category tables, price history and tracking
  const { changes } = db.prepare(`DELETE FROM product_index WHERE source = 'sample'`).run();
  console.log(`Removed ${changes} sample listing(s).`);
  process.exit(0);
}

// [category slug, name, current price, previous price or null]
const SAMPLES = [
  ['phones-tablets', 'Samsung Galaxy A15 128GB Dual SIM', 17999, 21999],
  ['phones-tablets', 'Samsung Galaxy A15 128GB', 16990, 19500],
  ['phones-tablets', 'Tecno Spark 20 Pro 256GB', 16499, null],
  ['phones-tablets', 'Infinix Hot 40i 128GB', 11999, 13500],
  ['phones-tablets', 'Apple iPad 10th Gen 64GB Wi-Fi', 42999, 49999],
  ['tvs-audio', 'Hisense 43 inch Full HD Smart TV', 26500, 31999],
  ['tvs-audio', 'Hisense 43 inch Full HD Smart TV Frameless', 25900, null],
  ['tvs-audio', 'Samsung 55 inch 4K Crystal UHD TV', 58999, 67000],
  ['tvs-audio', 'JBL Party Speaker Bluetooth 120W', 18500, 22000],
  ['computing', 'HP 15 Core i5 8GB RAM 512GB SSD Laptop', 64999, 72500],
  ['computing', 'Lenovo IdeaPad Slim 3 Ryzen 5 Laptop', 58500, null],
  ['computing', 'Seagate 1TB Portable External Hard Drive', 6800, 7900],
  ['appliances', 'Ramtons 1.5L Electric Kettle', 2450, 2999],
  ['appliances', 'Binatone 5L Digital Air Fryer', 7990, 10500],
  ['appliances', 'Hisense 185L Single Door Refrigerator', 27900, 31500],
  ['fashion', 'Nike Revolution 7 Men Running Shoes', 6490, 8200],
  ['fashion', 'Adidas Lite Racer Sneakers Unisex', 5900, 7400],
  ['fashion', 'Leather Backpack Office Laptop Bag', 2800, 3600],
  ['home-office', 'Ergonomic Mesh Office Chair with Headrest', 13500, 16900],
  ['home-office', 'Adjustable Standing Desk 120cm', 21900, null],
  ['health-beauty', 'Nivea Body Lotion Cocoa Butter 400ml', 890, 1150],
  ['health-beauty', 'Philips Hair Dryer 2100W', 3150, 3900],
  ['health-beauty', 'Oral-B Electric Toothbrush Rechargeable', 4700, 5600],
  ['gaming', 'PlayStation DualSense Wireless Controller', 8900, 10200],
  ['gaming', 'Xbox Wireless Controller Carbon Black', 7800, null],
  ['gaming', 'Gaming Headset with RGB Lights 7.1', 3450, 4200],
];

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const categoryId = (categorySlug) => db.prepare('SELECT id FROM categories WHERE slug = ?').get(categorySlug)?.id ?? null;
const findSample = db.prepare(`SELECT id FROM product_index WHERE source = 'sample' AND external_id = ?`);
const insertHistory = db.prepare(`INSERT INTO price_history (product_id, price, old_price, recorded_at) VALUES (?, ?, ?, ?)`);

const daysAgo = (days) => new Date(Date.now() - days * 864e5).toISOString().slice(0, 19).replace('T', ' ');

db.transaction(() => {
  SAMPLES.forEach(([categorySlug, name, price, oldPrice], i) => {
    const externalId = `/sample/${slug(name)}`;
    const isNew = !findSample.get(externalId);
    const discountPct = oldPrice ? Math.round((1 - price / oldPrice) * 100) : null;
    const rating = Math.round((3.6 + ((i * 37) % 14) / 10) * 10) / 10;
    const high = Math.round((oldPrice || price) * 1.05);
    const low = Math.round(price * 0.92);

    // Same write path as a scrape: creates or updates the product in its category table
    saveListings(
      [
        {
          source: 'sample',
          externalId,
          url: `https://example.com/sample-listing/${slug(name)}`,
          name,
          image: null,
          price,
          oldPrice,
          discountPct,
          rating,
        },
      ],
      categoryId(categorySlug)
    );

    if (!isNew) return;

    // Backdate the first sighting and give the product a believable price trail
    const { id } = findSample.get(externalId);
    const { table } = findProductRow(id);
    db.prepare(`UPDATE "${table}" SET lowest_price = ?, highest_price = ?, first_seen_at = ? WHERE id = ?`).run(
      low,
      high,
      daysAgo(60),
      id
    );
    db.prepare('DELETE FROM price_history WHERE product_id = ?').run(id);
    insertHistory.run(id, high, null, daysAgo(60));
    insertHistory.run(id, Math.round((high + price) / 2), null, daysAgo(30));
    insertHistory.run(id, price, oldPrice, daysAgo(2));
  });
})();

console.log(`Added ${SAMPLES.length} sample listings. Remove them with: npm run seed:demo -- --clear`);
