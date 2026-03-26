import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { migrateOpenspec } from '../../core/migrate.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function createOpenspecFixture(root: string, specs: Record<string, string>, changes?: Record<string, { proposal?: string; specs?: Record<string, string> }>) {
  for (const [name, content] of Object.entries(specs)) {
    const specDir = path.join(root, 'openspec', 'specs', name);
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, 'spec.md'), content);
  }
  if (changes) {
    for (const [changeName, artifacts] of Object.entries(changes)) {
      const changeDir = path.join(root, 'openspec', 'changes', changeName);
      fs.mkdirSync(changeDir, { recursive: true });
      if (artifacts.proposal) {
        fs.writeFileSync(path.join(changeDir, 'proposal.md'), artifacts.proposal);
      }
      if (artifacts.specs) {
        for (const [specName, content] of Object.entries(artifacts.specs)) {
          const specDir = path.join(changeDir, 'specs', specName);
          fs.mkdirSync(specDir, { recursive: true });
          fs.writeFileSync(path.join(specDir, 'spec.md'), content);
        }
      }
    }
  }
}

function initForemanDirs(root: string) {
  const dirs = ['.foreman/specs', '.foreman/changes', '.foreman/changes/archive'];
  for (const d of dirs) {
    fs.mkdirSync(path.join(root, d), { recursive: true });
  }
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('migrateOpenspec', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'foreman-migrate-'));
    initForemanDirs(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('flattens spec files from openspec/specs/<name>/spec.md to .foreman/specs/<name>.md', () => {
    createOpenspecFixture(root, {
      'auth': '### Requirement: Auth SHALL work',
      'cache': '### Requirement: Cache SHALL work',
    });

    const result = migrateOpenspec(root);

    expect(fs.existsSync(path.join(root, '.foreman', 'specs', 'auth.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.foreman', 'specs', 'cache.md'))).toBe(true);
    expect(fs.readFileSync(path.join(root, '.foreman', 'specs', 'auth.md'), 'utf-8')).toContain('Auth SHALL work');
    expect(result.specsMigrated).toBe(2);
  });

  it('maps change proposals to .foreman/changes/<name>/proposal.md', () => {
    createOpenspecFixture(root, {}, {
      'add-auth': { proposal: '# Add Auth\n\n## Why\nBecause.' },
    });

    const result = migrateOpenspec(root);

    expect(fs.existsSync(path.join(root, '.foreman', 'changes', 'add-auth', 'proposal.md'))).toBe(true);
    expect(fs.readFileSync(path.join(root, '.foreman', 'changes', 'add-auth', 'proposal.md'), 'utf-8')).toContain('Add Auth');
    expect(result.changesMigrated).toBe(1);
  });

  it('maps change delta specs flattened into .foreman/changes/<name>/specs/<specname>.md', () => {
    createOpenspecFixture(root, {}, {
      'add-auth': {
        specs: { 'auth': '### Requirement: JWT Auth delta' },
      },
    });

    const result = migrateOpenspec(root);

    const destPath = path.join(root, '.foreman', 'changes', 'add-auth', 'specs', 'auth.md');
    expect(fs.existsSync(destPath)).toBe(true);
    expect(fs.readFileSync(destPath, 'utf-8')).toContain('JWT Auth delta');
  });

  it('deletes openspec/ directory after migration', () => {
    createOpenspecFixture(root, { 'auth': 'content' });

    migrateOpenspec(root);

    expect(fs.existsSync(path.join(root, 'openspec'))).toBe(false);
  });

  it('throws if openspec/ does not exist', () => {
    expect(() => migrateOpenspec(root)).toThrow(/openspec/i);
  });

  it('returns migration summary with counts', () => {
    createOpenspecFixture(root,
      { 'auth': 'spec A', 'cache': 'spec B' },
      { 'my-change': { proposal: '# Change', specs: { 'auth': 'delta' } } }
    );

    const result = migrateOpenspec(root);

    expect(result.specsMigrated).toBe(2);
    expect(result.changesMigrated).toBe(1);
    expect(result.filesTotal).toBeGreaterThanOrEqual(3);
  });

  it('handles empty openspec/ with no specs or changes', () => {
    fs.mkdirSync(path.join(root, 'openspec'), { recursive: true });

    const result = migrateOpenspec(root);

    expect(result.specsMigrated).toBe(0);
    expect(result.changesMigrated).toBe(0);
    expect(fs.existsSync(path.join(root, 'openspec'))).toBe(false);
  });

  it('overwrites existing specs on conflict', () => {
    // Pre-populate .foreman/specs/
    fs.writeFileSync(path.join(root, '.foreman', 'specs', 'auth.md'), 'OLD content');

    createOpenspecFixture(root, { 'auth': 'NEW content from openspec' });

    migrateOpenspec(root);

    const content = fs.readFileSync(path.join(root, '.foreman', 'specs', 'auth.md'), 'utf-8');
    expect(content).toContain('NEW content');
    expect(content).not.toContain('OLD content');
  });
});
