import { jumia } from './jumia.js';
import { kilimall } from './kilimall.js';

export const SOURCES = { jumia, kilimall };

export function listSources() {
  return Object.values(SOURCES).map(({ key, name, status }) => ({ key, name, status }));
}
