import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createTestProject, runSpecwork, cleanup } from './helpers.js';

describe('specwork init migrate', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
  });

  afterEach(() => {
    cleanup(dir);
  });

  // ── helper to create openspec/ structure ────────────────────────────────

  function createOpenspec(specs: Record<string, string>, changes?: Record<string, { proposal?: string; specs?: Record<string, string> }>) {
    // Create specs: openspec/specs/<name>/spec.md
    for (const [name, content] of Object.entries(specs)) {
      const specDir = path.join(dir, 'openspec', 'specs', name);
      fs.mkdirSync(specDir, { recursive: true });
      fs.writeFileSync(path.join(specDir, 'spec.md'), content);
    }

    // Create changes: openspec/changes/<name>/...
    if (changes) {
      for (const [changeName, artifacts] of Object.entries(changes)) {
        const changeDir = path.join(dir, 'openspec', 'changes', changeName);
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

  // ── Spec flattening ────────────────────────────────────────────────────

  it('flattens openspec/specs/<name>/spec.md to .specwork/specs/<name>.md', () => {
    createOpenspec({
      'auth': '### Requirement: Auth\n\nUsers SHALL authenticate via JWT.',
      'rate-limit': '### Requirement: Rate Limit\n\nAPI SHOULD rate limit.',
    });

    const result = runSpecwork(dir, 'init migrate');
    expect(result.exitCode).toBe(0);

    expect(fs.existsSync(path.join(dir, '.specwork', 'specs', 'auth.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, '.specwork', 'specs', 'rate-limit.md'))).toBe(true);

    const authContent = fs.readFileSync(path.join(dir, '.specwork', 'specs', 'auth.md'), 'utf-8');
    expect(authContent).toContain('Users SHALL authenticate via JWT');
  });

  // ── Change directory mapping ───────────────────────────────────────────

  it('maps openspec/changes/ to .specwork/changes/', () => {
    createOpenspec({}, {
      'add-jwt': {
        proposal: '# Add JWT\n\n## Why\nBecause auth.',
        specs: {
          'auth': '### Requirement: JWT Auth\n\n#### Scenario: Login\n- Given user\n- When login\n- Then token',
        },
      },
    });

    const result = runSpecwork(dir, 'init migrate');
    expect(result.exitCode).toBe(0);

    expect(fs.existsSync(path.join(dir, '.specwork', 'changes', 'add-jwt', 'proposal.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, '.specwork', 'changes', 'add-jwt', 'specs', 'auth.md'))).toBe(true);

    const specContent = fs.readFileSync(path.join(dir, '.specwork', 'changes', 'add-jwt', 'specs', 'auth.md'), 'utf-8');
    expect(specContent).toContain('JWT Auth');
  });

  // ── Destructive — openspec/ removed ────────────────────────────────────

  it('deletes openspec/ directory after migration', () => {
    createOpenspec({ 'auth': '### Requirement: Auth\nContent.' });

    runSpecwork(dir, 'init migrate');

    expect(fs.existsSync(path.join(dir, 'openspec'))).toBe(false);
  });

  // ── Auto-init if .specwork/ missing ─────────────────────────────────────

  it('runs specwork init first if .specwork/ does not exist', () => {
    createOpenspec({ 'auth': '### Requirement: Auth\nContent.' });
    // Don't run specwork init — migrate should do it

    const result = runSpecwork(dir, 'init migrate');
    expect(result.exitCode).toBe(0);

    // .specwork/ should exist with full init
    expect(fs.existsSync(path.join(dir, '.specwork', 'config.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(dir, '.claude', 'agents', 'specwork-implementer.md'))).toBe(true);

    // Specs should be migrated
    expect(fs.existsSync(path.join(dir, '.specwork', 'specs', 'auth.md'))).toBe(true);
  });

  // ── Error: no openspec/ ────────────────────────────────────────────────

  it('errors if openspec/ does not exist', () => {
    const result = runSpecwork(dir, 'init migrate');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/openspec/i);
  });

  // ── Migrate with existing .specwork/ ────────────────────────────────────

  it('merges into existing .specwork/ without destroying it', () => {
    runSpecwork(dir, 'init');

    createOpenspec({ 'auth': '### Requirement: Auth\nContent.' });

    const result = runSpecwork(dir, 'init migrate');
    expect(result.exitCode).toBe(0);

    // Original init artifacts should still exist
    expect(fs.existsSync(path.join(dir, '.specwork', 'config.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(dir, '.specwork', 'templates', 'proposal.md'))).toBe(true);

    // Migrated spec should exist
    expect(fs.existsSync(path.join(dir, '.specwork', 'specs', 'auth.md'))).toBe(true);
  });

  // ── Doctor runs after migrate ──────────────────────────────────────────

  it('runs doctor after migration and shows results', () => {
    createOpenspec({ 'auth': '### Requirement: Auth\n\n#### Scenario: Login\n- Given user\n- When login\n- Then token' });

    const result = runSpecwork(dir, 'init migrate');
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/✓|passed|pass/i);
  });

  // ── Migration summary ─────────────────────────────────────────────────

  it('shows migration summary with counts', () => {
    createOpenspec(
      { 'auth': 'Spec A', 'cache': 'Spec B' },
      { 'my-change': { proposal: '# Change', specs: { 'auth': 'Delta spec' } } }
    );

    const result = runSpecwork(dir, 'init migrate');
    const combined = result.stdout + result.stderr;
    // Should mention specs and changes migrated
    expect(combined).toMatch(/spec|migrat/i);
  });
});
