import type { MigrationFn } from '../types/migration.js';

export const description = 'Migration for version 0.2.0';

export const migrate: MigrationFn = (_root, _config) => {
  // No-op placeholder — first migration stub
  return { changed: false };
};
