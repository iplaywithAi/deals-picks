import { createApp } from './app.js';
import { config } from './config.js';
import { recoverInterruptedRuns } from './services/scraper.js';
import { syncSchedules } from './services/scheduler.js';

const app = createApp();

recoverInterruptedRuns();

app.listen(config.port, () => {
  console.log(`BeiWatch API listening on http://localhost:${config.port}`);
  syncSchedules();
});
