import { parseDiscount, parsePrice, parseRating } from '../utils/price.js';

// Turns raw text scraped from a page into a listing row. Returns null when unusable.
export function toListing(store, raw) {
  const price = parsePrice(raw.price);
  if (!raw.name || !raw.url || !price || price <= 0) return null;

  let url;
  try {
    url = new URL(raw.url, store.baseUrl);
  } catch {
    return null;
  }

  const oldPrice = parsePrice(raw.oldPrice);
  const hasOldPrice = oldPrice && oldPrice > price;
  const discountPct =
    parseDiscount(raw.discount) ?? (hasOldPrice ? Math.round((1 - price / oldPrice) * 100) : null);

  return {
    source: store.key,
    externalId: url.pathname,           // stable per product, ignores tracking query strings
    url: `${url.origin}${url.pathname}`,
    name: raw.name.replace(/\s+/g, ' ').trim().slice(0, 240),
    image: raw.image || null,
    price,
    oldPrice: hasOldPrice ? oldPrice : null,
    discountPct,
    rating: parseRating(raw.rating, raw.ratingPercent),
  };
}
