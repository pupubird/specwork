import type { MigrationEntry, MigrationResult } from '../types/migration.js';

// ── Static Migration Registry ───────────────────────────────────────────────
// Each migration is explicitly imported and registered here.
// The postversion script auto-appends new entries.

import { migrate as migrate_0_1_1, description as desc_0_1_1 } from './0.1.1.js';
import { migrate as migrate_0_2_0, description as desc_0_2_0 } from './0.2.0.js';

export const migrations: MigrationEntry[] = [
  { version: '0.1.1', description: desc_0_1_1, migrate: migrate_0_1_1 },
  { version: '0.2.0', description: desc_0_2_0, migrate: migrate_0_2_0 },
];

// ── Get Pending Migrations ──────────────────────────────────────────────────

export function getPendingMigrations(
  previousVersion: string,
  installedVersion: string,
  appliedMigrations: string[],
): MigrationEntry[] {
  const appliedSet = new Set(appliedMigrations);

  return migrations
    .filter((entry) => {
      // Must be > previousVersion and <= installedVersion
      if (compareSemver(entry.version, previousVersion) <= 0) return false;
      if (compareSemver(entry.version, installedVersion) > 0) return false;
      // Must not be already applied
      if (appliedSet.has(entry.version)) return false;
      return true;
    })
    .sort((a, b) => compareSemver(a.version, b.version));
}

// ── Run Migrations ──────────────────────────────────────────────────────────

export function runMigrations(
  root: string,
  config: Record<string, unknown>,
  pendingMigrations: MigrationEntry[],
): { executed: string[]; error?: { version: string; message: string } } {
  const executed: string[] = [];

  for (const migration of pendingMigrations) {
    try {
      migration.migrate(root, config);
      executed.push(migration.version);
    } catch (err) {
      return {
        executed,
        error: {
          version: migration.version,
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  return { executed };
}

// ── Semver Comparison ───────────────────────────────────────────────────────

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}
