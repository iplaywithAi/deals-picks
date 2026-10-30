# BeiWatch

A price comparison site for Kenyan online stores. Shoppers browse categories, compare listings side by side, see price history, and track products against a target price. Admins control scraping through schedules, run jobs on demand, and manage categories, products and users.

**Stack:** React 18 · Vite · Tailwind CSS · Recharts · Lucide icons (client) · Node.js · Express 5 · SQLite (better-sqlite3) · Puppeteer · node-cron (server)

## Features

**Shoppers**
- Browse eight categories, search, filter by store, price range and minimum discount, and sort.
- Product pages with price history, lowest and highest seen, and similar listings from other stores.
- Compare up to four listings side by side with a summary (lowest price, savings, cheapest match elsewhere), a "same product elsewhere" row, a show-differences-only filter, a share link, CSV export and a price history chart.
- Sign up and sign in. Track products and set a target price. The tracking page flags items that reach it.
- Change your password from the account menu. Signing out is inside the menu, so it is not on screen until you open it.
- Works on phones, tablets and desktops. Wide tables scroll inside their card instead of stretching the page.

**Admins** (`/admin`)
- Overview: listing counts, users, tracked items, and scrape health for the last 24 hours.
- Scraper: create, edit, enable, disable, run and delete schedules (presets or custom cron, Africa/Nairobi time). Run one search now, run every category, and review the full run history with errors.
- Products: search, re-file to another category, remove.
- Categories: create and edit with icon, description and default search term.
- Users: search, promote or demote admins, delete accounts.

## Project layout

```
beiwatch/
├── server/
│   ├── src/
│   │   ├── index.js            Starts the server, recovers runs, syncs schedules
│   │   ├── app.js              Builds the Express app (used by the server and tests)
│   │   ├── config.js           Environment configuration
│   │   ├── db.js               SQLite schema, per-category product tables, migration, default categories, admin seeding
│   │   ├── lib/products.js     Product storage: category tables, moves, saving scrape results
│   │   ├── middleware/auth.js  JWT cookie auth, admin guard
│   │   ├── routes/             auth (incl. password change), products, tracking, admin
│   │   ├── scrapers/           browser helpers, jumia.js, kilimall.js, normalize.js
│   │   ├── services/           scrape queue + persistence, cron scheduler
│   │   └── utils/              price parsing, name matching, helpers
│   ├── scripts/                make-admin.js, seed-demo.js
│   └── test/                   API tests, migration test, unit tests and browser fixture tests
└── client/
    ├── src/
    │   ├── pages/              shopping pages, admin pages (lazy loaded)
    │   ├── components/         navbar, product card, chart, modal, UI primitives
    │   ├── context/            auth, compare basket, toasts
    │   └── lib/                API client, formatting, icons, schedule presets
    └── tailwind.config.js
```

## Setup

Requirements: Node.js 20 or newer (22 LTS recommended) and npm.

```bash
# 1. Server
cd server
cp .env.example .env          # then edit the values
npm install                   # downloads Chrome for Puppeteer (about 170 MB)

# 2. Client
cd ../client
npm install
```

### Environment variables (`server/.env`)

| Variable | Purpose |
| --- | --- |
| `PORT` | API port, default `4000` |
| `JWT_SECRET` | Required in production. Use a long random string. |
| `DB_FILE` | SQLite file path, default `server/data/beiwatch.db`. Tests use their own file under `server/data`. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Creates an admin account on first boot if it does not exist |
| `SCRAPER_HEADLESS` | `false` shows the browser while scraping, useful for debugging |
| `CHROME_PATH` | Use an installed Chrome or Chromium instead of the bundled one |
| `SCRAPER_PAGE_DELAY_MS` | Pause between result pages, default `2000` |
| `SCHEDULE_TIMEZONE` | Timezone for cron schedules, default `Africa/Nairobi` |

### Run in development

Two terminals:

```bash
cd server && npm run dev      # API on http://localhost:4000
cd client && npm run dev      # site on http://localhost:5173 (proxies /api)
```

### Run in production

```bash
cd client && npm run build    # creates client/dist
cd ../server && NODE_ENV=production JWT_SECRET=... npm start
```

The API then serves the site as well, on `PORT`.

### Create your admin account

Either set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before the first start, or sign up normally and promote the account:

```bash
cd server && npm run make-admin -- you@example.com
```

### Sample data (optional)

To preview the site before any scraping, load clearly labelled sample listings. They appear with a "Sample data" badge.

```bash
cd server && npm run seed:demo             # add
cd server && npm run seed:demo -- --clear  # remove
```

## Data storage

Each category has its own product table (`products_phones_tablets`, `products_tvs_audio`, and so on), plus `products_uncategorised` for listings with no category. A `product_index` table owns every product id and records which table holds it. Price history and tracking are single tables keyed by product id, so a product keeps its history and its trackers when an admin moves it to another category.

Moving a product between categories copies its row to the new table and removes it from the old one, in one transaction. Deleting a category first moves its products to uncategorised, then drops its table. A category's slug names its table, so it stays fixed when the category is renamed.

**Upgrading an existing database:** on first start, the server detects the old single `products` table and moves every product into the matching category table. Product ids, price history and tracking are kept. The migration runs in one transaction and checks the row counts before it commits. If the counts do not match, nothing changes and the server reports the error. Back up `server/data/beiwatch.db` before the first start of this version.

## Scrapers

| Store | Status | Notes |
| --- | --- | --- |
| Jumia (`jumia.co.ke`) | Verified | Uses the same selectors as the original `jumia_scraper.js` (`article.prd`, `.name`, `.prc`, `.old`, `.bdg._dsct`, `.stars._s`). |
| Kilimall (`kilimall.co.ke`) | Experimental | Reads JSON-LD product data first, then product links that sit next to a `KSh` price. It has not been checked against the live site, so expect to adjust selectors after the first run. Check the run log. |

To add a store, create `server/src/scrapers/<store>.js` that exports `scrape({ browser, query, pages, log, delayMs })` and returns normalised listings, then register it in `scrapers/index.js`. Use `toListing()` from `normalize.js` so prices, discounts and identifiers are handled the same way for every store.

**How listings are identified:** each product is keyed by store and URL path, so tracking query strings do not create duplicates. A new price history point is recorded only when the price changes.

**How comparison works:** listings are grouped into categories. Similar listings are found by comparing product name tokens (Jaccard similarity, 40% or more). This is name matching, not barcode or model matching, so review results if your catalogue grows.

## Scheduling

- Schedules use standard five-field cron expressions in Africa/Nairobi time.
- Scrapes run one at a time through a queue, so the browser is never launched twice at once.
- Runs left in progress by a restart are marked as failed with a clear message.
- The scheduler lives inside the API process. Keep the server running (for example with pm2, systemd or a container) or scheduled runs will not fire.

## Tests

```bash
cd server
npm test                                          # API, migration and unit tests
CHROME_PATH=/path/to/chrome npm test              # also runs browser fixture tests
```

- `test/api.test.js` covers sign up, sign in, password change (old sessions are ended), the catalogue, compare limits, tracking, and admin category and product changes.
- `test/migration.test.js` builds a database in the old layout and checks that the migration keeps ids, history, tracking and counts.

## Before you launch

- **Check the store terms.** Jumia and Kilimall restrict automated access in their terms of service. Review them, respect `robots.txt` where it applies, keep the schedule frequency modest, and get permission if you plan a commercial launch.
- **Rotate credentials in the original project.** The archive you shared contains a `.env` file and `jumia/firebase-service-account.json`. Neither is used by BeiWatch and neither was copied into it. Treat both as exposed: revoke the service account key in Google Cloud and do not commit those files.
- **Set a real `JWT_SECRET`** and serve the site over HTTPS. The session cookie is `Secure` in production.
- **Known limits:** there is no password reset by email yet, and price alerts appear inside the tracking page rather than being sent to the shopper. Cross-store matching is based on product names, so "same product elsewhere" is an estimate. The migration has been tested on a fixture, not on a real production database.

## Icons and design

Icons are from Lucide. The palette is neutral slate with a single teal accent for states such as "target reached" and "best price", so the interface stays calm and the prices stand out.
#   b e i w a t c h  
 