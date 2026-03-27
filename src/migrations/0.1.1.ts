import fs from 'node:fs';
import path from 'node:path';
import type { MigrationFn } from '../types/migration.js';

export const description = 'Rename summary.md to digest.md in archived changes';

export const migrate: MigrationFn = (root, _config) => {
  const archiveDir = path.join(root, '.specwork', 'changes', 'archive');
  if (!fs.existsSync(archiveDir)) {
    return { changed: false };
  }

  const details: string[] = [];
  const entries = fs.readdirSync(archiveDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const oldPath = path.join(archiveDir, entry.name, 'summary.md');
    const newPath = path.join(archiveDir, entry.name, 'digest.md');

    if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
      fs.renameSync(oldPath, newPath);
      details.push(`Renamed ${entry.name}/summary.md → digest.md`);
    }
  }

  return {
    changed: details.length > 0,
    details: details.length > 0 ? details : undefined,
  };
};
