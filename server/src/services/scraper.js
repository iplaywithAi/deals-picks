import { db } from '../db.js';
import { config } from '../config.js';
import { saveListings } from '../lib/products.js';
import { withBrowser } from '../scrapers/browser.js';
import { SOURCES } from '../scrapers/index.js';

// Scrapes run one at a time so the browser is never launched twice in parallel
const queue = [];
let draining = false;

export function recoverInterruptedRuns() {
  db.prepare(
    `UPDATE scrape_runs
     SET status = 'failed', error = 'Interrupted by a server restart', finished_at = datetime('now')
     WHERE status IN ('queued', 'running')`
  ).run();
}

export function enqueueScrape({ source, query, pages, categoryId = null, scheduleId = null, origin }) {
  if (!SOURCES[source]) throw new Error(`Unknown source: ${source}`);

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO scrape_runs (schedule_id, category_id, source, query, pages, origin, status)
       VALUES (?, ?, ?, ?, ?, ?, 'queued')`
    )
    .run(scheduleId, categoryId, source, query, pages, origin);

  const runId = Number(lastInsertRowid);
  queue.push({ runId, source, query, pages, categoryId });
  drain();
  return runId;
}

// Queues one run per category that has a default search query
export function enqueueAllCategories({ source, pages }) {
  const categories = db
    .prepare(
      `SELECT id, default_query AS query FROM categories
       WHERE default_query IS NOT NULL AND TRIM(default_query) <> ''
       ORDER BY sort_order`
    )
    .all();

  return categories.map((c) =>
    enqueueScrape({ source, query: c.query, pages, categoryId: c.id, origin: 'manual' })
  );
}

async function drain() {
  if (draining) return;
  draining = true;
  try {
    while (queue.length) {
      await execute(queue.shift());
    }
  } finally {
    draining = false;
  }
}

async function execute(job) {
  const { runId, source, query, pages, categoryId } = job;
  const log = (message) => console.log(`[scrape #${runId}] ${message}`);

  db.prepare(`UPDATE scrape_runs SET status = 'running' WHERE id = ?`).run(runId);
  log(`started: ${source} "${query}" (${pages} page(s))`);

  try {
    const listings = await withBrowser((browser) =>
      SOURCES[source].scrape({
        browser,
        query,
        pages,
        log,
        delayMs: config.scraper.pageDelayMs,
      })
    );

    const saved = saveListings(listings, categoryId);
    db.prepare(
      `UPDATE scrape_runs
       SET status = 'success', items_found = ?, items_saved = ?, finished_at = datetime('now')
       WHERE id = ?`
    ).run(listings.length, saved, runId);
    log(`finished: ${listings.length} found, ${saved} saved`);
  } catch (err) {
    log(`failed: ${err.message}`);
    db.prepare(
      `UPDATE scrape_runs SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ?`
    ).run(err.message.slice(0, 500), runId);
  }
}
