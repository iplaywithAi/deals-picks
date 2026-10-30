import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  port: Number(process.env.PORT) || 4000,
  env: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  dbFile: process.env.DB_FILE || path.join(serverRoot, 'data', 'beiwatch.db'),
  clientDist: path.resolve(serverRoot, '..', 'client', 'dist'),
  admin: {
    name: process.env.ADMIN_NAME || 'Administrator',
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  },
  scraper: {
    headless: process.env.SCRAPER_HEADLESS !== 'false',
    chromePath: process.env.CHROME_PATH || undefined,
    pageDelayMs: Number(process.env.SCRAPER_PAGE_DELAY_MS) || 2000,
    timezone: process.env.SCHEDULE_TIMEZONE || 'Africa/Nairobi',
  },
};

if (config.env === 'production' && config.jwtSecret === 'dev-only-change-me') {
  throw new Error('JWT_SECRET must be set in production');
}
