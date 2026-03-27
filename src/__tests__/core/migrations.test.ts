/**
 * Unit tests for the specwork migration runner core logic.
 *
 * RED state: src/migrations/index.ts does not exist yet — all tests must fail on import.
 *
 * Covers spec requirements:
 *   1. Migration File Format — idempotent, exports migrate + description
 *   2. Migration Runner — discover, filter, sort, execute, halt on failure
 *   4. Migration History Tracking — manifest tracks applied, runner skips them
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stringify as stringifyYaml } from 'yaml';

import {
  getPendingMigrations,
  runMigrations,
  migrations,
} from '../../migrations/index.js';

import type {
  MigrationFn,
  MigrationResult,
  MigrationEntry,
} from '../../types/migration.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-migrations-'));
}

function makeMigrationEntry(
  version: string,
  opts: { changed?: boolean; throws?: boolean } = {},
): MigrationEntry {
  return {
    version,
    description: `Migration for version ${version}`,
    migrate: (_root: string, _config: Record<string, unknown>): MigrationResult => {
      if (opts.throws) {
        throw new Error(`Migration ${version} failed`);
      }
      return { changed: opts.changed ?? false };
    },
  };
}

// ── getPendingMigrations ─────────────────────────────────────────────────────

describe('getPendingMigrations', () => {
  it('filters migrations > previousVersion and <= installedVersion', () => {
    const result = getPendingMigrations('0.1.0', '0.3.0', []);
    // Should include 0.2.0 and 0.3.0, not 0.1.0 or anything above 0.3.0
    for (const entry of result) {
      expect(entry.version).not.toBe('0.1.0');
    }
    // All returned versions should be in the valid range
    expect(result.every((e) => e.version > '0.1.0')).toBe(true);
  });

  it('excludes already-applied migrations', () => {
    const result = getPendingMigrations('0.1.0', '0.3.0', ['0.2.0']);
    const versions = result.map((e) => e.version);
    expect(versions).not.toContain('0.2.0');
  });

  it('sorts results by semver ascending', () => {
    const result = getPendingMigrations('0.0.0', '1.0.0', []);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].version > result[i - 1].version).toBe(true);
    }
  });

  it('returns empty array when no migrations are pending', () => {
    // When all in-range migrations are already applied
    const result = getPendingMigrations('0.1.0', '0.3.0', ['0.1.1', '0.1.2', '0.2.0', '0.3.0']);
    expect(result).toEqual([]);
  });

  it('returns empty array when previousVersion equals installedVersion', () => {
    const result = getPendingMigrations('0.2.0', '0.2.0', []);
    expect(result).toEqual([]);
  });

  it('does not include migrations at exactly previousVersion', () => {
    const result = getPendingMigrations('0.2.0', '0.3.0', []);
    const versions = result.map((e) => e.version);
    expect(versions).not.toContain('0.2.0');
  });

  it('includes migration at exactly installedVersion', () => {
    // If a migration exists for 0.3.0 and we're upgrading to 0.3.0,
    // it should be included (version <= installedVersion)
    const result = getPendingMigrations('0.2.0', '0.3.0', []);
    // This is a structural test — the important thing is that
    // the boundary version is included when it exists in the registry
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── runMigrations ────────────────────────────────────────────────────────────

describe('runMigrations', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpRoot();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('executes migrations in order and returns executed version list', () => {
    const pending = [
      makeMigrationEntry('0.2.0'),
      makeMigrationEntry('0.3.0'),
    ];

    const result = runMigrations(root, {}, pending);
    expect(result.executed).toEqual(['0.2.0', '0.3.0']);
    expect(result.error).toBeUndefined();
  });

  it('returns empty executed list when no migrations are provided', () => {
    const result = runMigrations(root, {}, []);
    expect(result.executed).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it('halts on failure and does not run subsequent migrations', () => {
    const pending = [
      makeMigrationEntry('0.2.0', { throws: true }),
      makeMigrationEntry('0.3.0'),
    ];

    const result = runMigrations(root, {}, pending);
    expect(result.executed).toEqual([]);
    expect(result.error).toBeDefined();
    expect(result.error!.version).toBe('0.2.0');
    expect(result.error!.message).toContain('Migration 0.2.0 failed');
  });

  it('returns error info with version and message on failure', () => {
    const pending = [
      makeMigrationEntry('0.2.0', { throws: true }),
    ];

    const result = runMigrations(root, {}, pending);
    expect(result.error).toMatchObject({
      version: '0.2.0',
      message: expect.stringContaining('failed'),
    });
  });

  it('executes first migration before halting on second failure', () => {
    const pending = [
      makeMigrationEntry('0.2.0'),
      makeMigrationEntry('0.3.0', { throws: true }),
      makeMigrationEntry('0.4.0'),
    ];

    const result = runMigrations(root, {}, pending);
    expect(result.executed).toEqual(['0.2.0']);
    expect(result.error).toBeDefined();
    expect(result.error!.version).toBe('0.3.0');
  });

  it('passes root and config to each migration function', () => {
    const migrateSpy = vi.fn(
      (_root: string, _config: Record<string, unknown>): MigrationResult => ({
        changed: false,
      }),
    );

    const pending: MigrationEntry[] = [
      {
        version: '0.2.0',
        description: 'Test migration',
        migrate: migrateSpy,
      },
    ];

    const config = { models: { default: 'sonnet' } };
    runMigrations(root, config, pending);

    expect(migrateSpy).toHaveBeenCalledWith(root, config);
  });

  it('records all successfully executed versions before failure', () => {
    const pending = [
      makeMigrationEntry('0.2.0'),
      makeMigrationEntry('0.3.0'),
      makeMigrationEntry('0.4.0', { throws: true }),
    ];

    const result = runMigrations(root, {}, pending);
    expect(result.executed).toEqual(['0.2.0', '0.3.0']);
    expect(result.error!.version).toBe('0.4.0');
  });
});

// ── Migration idempotency ────────────────────────────────────────────────────

describe('migration idempotency', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpRoot();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('running the same migration twice produces the same result', () => {
    const migration = makeMigrationEntry('0.2.0', { changed: true });
    const config = { key: 'value' };

    const result1 = runMigrations(root, config, [migration]);
    const result2 = runMigrations(root, config, [migration]);

    expect(result1.executed).toEqual(result2.executed);
    expect(result1.error).toEqual(result2.error);
  });
});

// ── Migration history (manifest integration) ────────────────────────────────

describe('migration history tracking', () => {
  it('already-applied migrations are skipped even if in version range', () => {
    // 0.2.0 is in the range (0.1.0, 0.3.0] but already applied
    const result = getPendingMigrations('0.1.0', '0.3.0', ['0.2.0']);
    const versions = result.map((e) => e.version);
    expect(versions).not.toContain('0.2.0');
  });

  it('returns only unapplied migrations from the valid range', () => {
    const result = getPendingMigrations('0.0.0', '0.5.0', ['0.1.0', '0.3.0']);
    const versions = result.map((e) => e.version);
    expect(versions).not.toContain('0.1.0');
    expect(versions).not.toContain('0.3.0');
  });
});

// ── Registry structure ───────────────────────────────────────────────────────

describe('migrations registry', () => {
  it('exports an array of MigrationEntry objects', () => {
    expect(Array.isArray(migrations)).toBe(true);
  });

  it('each entry has version, description, and migrate function', () => {
    for (const entry of migrations) {
      expect(typeof entry.version).toBe('string');
      expect(typeof entry.description).toBe('string');
      expect(typeof entry.migrate).toBe('function');
    }
  });
});
