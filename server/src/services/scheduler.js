import cron from 'node-cron';
import { db } from '../db.js';
import { config } from '../config.js';
import { enqueueScrape } from './scraper.js';

const tasks = new Map();

// Rebuilds all cron tasks from the schedules table. Call after any schedule change.
export function syncSchedules() {
  for (const task of tasks.values()) task.stop();
  tasks.clear();

  const schedules = db.prepare('SELECT id, name, cron FROM schedules WHERE enabled = 1').all();
  for (const schedule of schedules) {
    if (!cron.validate(schedule.cron)) {
      console.warn(`[scheduler] skipped "${schedule.name}": invalid cron "${schedule.cron}"`);
      continue;
    }
    tasks.set(
      schedule.id,
      cron.schedule(schedule.cron, () => runSchedule(schedule.id), { timezone: config.scraper.timezone })
    );
  }
  console.log(`[scheduler] ${tasks.size} active schedule(s)`);
}

export function runSchedule(scheduleId) {
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(scheduleId);
  if (!schedule) return null;
  return enqueueScrape({
    source: schedule.source,
    query: schedule.query,
    pages: schedule.pages,
    categoryId: schedule.category_id,
    scheduleId: schedule.id,
    origin: 'schedule',
  });
}
