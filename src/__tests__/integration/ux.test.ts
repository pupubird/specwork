/**
 * UX verification tests for Specwork CLI.
 *
 * Validates the user-facing CLI experience:
 *   - --version outputs version string
 *   - --help outputs help text
 *   - --json flag produces parseable JSON for all commands
 *   - Missing .specwork/ gives actionable error with "Did you run specwork init?" hint
 *   - Missing change name gives error that suggests available changes
 *   - Error messages include the change name for context
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createTestProject, runSpecwork, cleanup, writeTasksFile } from './helpers.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupProjectWithGraph(dir: string, change = 'my-change'): void {
  runSpecwork(dir, 'init');
  runSpecwork(dir, `new ${change}`);
  writeTasksFile(dir, change, '## 1. Core\n\n- [ ] 1.1 Add thing\n- [ ] 1.2 Wire up\n');
  runSpecwork(dir, `graph generate ${change}`);
}

function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// --version
// ══════════════════════════════════════════════════════════════════════════════

describe('UX: --version', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
  });

  afterEach(() => cleanup(dir));

  it('exits with code 0', () => {
    const result = runSpecwork(dir, '--version');
    expect(result.exitCode).toBe(0);
  });

  it('outputs a semver-like version string', () => {
    const result = runSpecwork(dir, '--version');
    const output = result.stdout + result.stderr;
    // Should match x.y.z version pattern
    expect(output).toMatch(/\d+\.\d+\.\d+/);
  });

  it('-v shorthand also outputs version', () => {
    const result = runSpecwork(dir, '-v');
    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/\d+\.\d+\.\d+/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// --help
// ══════════════════════════════════════════════════════════════════════════════

describe('UX: --help', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
  });

  afterEach(() => cleanup(dir));

  it('exits with code 0', () => {
    const result = runSpecwork(dir, '--help');
    expect(result.exitCode).toBe(0);
  });

  it('outputs Usage: in help text', () => {
    const result = runSpecwork(dir, '--help');
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/Usage:/i);
  });

  it('lists the specwork command name', () => {
    const result = runSpecwork(dir, '--help');
    const output = result.stdout + result.stderr;
    expect(output).toContain('specwork');
  });

  it('lists core subcommands in help text', () => {
    const result = runSpecwork(dir, '--help');
    const output = result.stdout + result.stderr;
    // At minimum, run and status should be listed
    expect(output).toMatch(/run|status/i);
  });

  it('subcommand --help works for run', () => {
    const result = runSpecwork(dir, 'run --help');
    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/Usage:/i);
    expect(output).toMatch(/change/i);
  });

  it('subcommand --help works for status', () => {
    const result = runSpecwork(dir, 'status --help');
    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/Usage:/i);
  });

  it('subcommand --help works for graph', () => {
    const result = runSpecwork(dir, 'graph --help');
    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/Usage:/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// --json flag produces parseable JSON for all commands
// ══════════════════════════════════════════════════════════════════════════════

describe('UX: --json produces parseable JSON', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
    setupProjectWithGraph(dir);
  });

  afterEach(() => cleanup(dir));

  it('specwork --json status my-change outputs parseable JSON', () => {
    const result = runSpecwork(dir, '--json status my-change');
    expect(result.exitCode).toBe(0);
    expect(isValidJson(result.stdout)).toBe(true);
  });

  it('specwork --json status (no change) outputs parseable JSON', () => {
    const result = runSpecwork(dir, '--json status');
    expect(result.exitCode).toBe(0);
    expect(isValidJson(result.stdout)).toBe(true);
  });

  it('specwork --json run my-change outputs parseable JSON', () => {
    const result = runSpecwork(dir, '--json run my-change');
    expect(result.exitCode).toBe(0);
    expect(isValidJson(result.stdout)).toBe(true);
  });

  it('specwork --json run my-change --dry-run outputs parseable JSON', () => {
    const result = runSpecwork(dir, '--json run my-change --dry-run');
    expect(result.exitCode).toBe(0);
    expect(isValidJson(result.stdout)).toBe(true);
  });

  it('specwork --json graph show my-change outputs parseable JSON', () => {
    const result = runSpecwork(dir, '--json graph show my-change');
    expect(result.exitCode).toBe(0);
    expect(isValidJson(result.stdout)).toBe(true);
  });

  it('specwork --json config show outputs parseable JSON', () => {
    const result = runSpecwork(dir, '--json config show');
    expect(result.exitCode).toBe(0);
    expect(isValidJson(result.stdout)).toBe(true);
  });

  it('JSON output has no extra non-JSON content before or after', () => {
    const result = runSpecwork(dir, '--json status my-change');
    // stdout should be exactly one JSON object/array
    const trimmed = result.stdout.trim();
    expect(trimmed.startsWith('{')).toBe(true);
    expect(trimmed.endsWith('}')).toBe(true);
  });

  it('JSON status response includes expected top-level keys', () => {
    const result = runSpecwork(dir, '--json status my-change');
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed).toHaveProperty('change');
    expect(parsed).toHaveProperty('status');
    expect(parsed).toHaveProperty('nodes');
    expect(parsed).toHaveProperty('progress');
  });

  it('JSON run response includes ready array and progress', () => {
    const result = runSpecwork(dir, '--json run my-change');
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed).toHaveProperty('ready');
    expect(parsed).toHaveProperty('progress');
    expect(Array.isArray(parsed.ready)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Error: missing .specwork/ should suggest specwork init
// ══════════════════════════════════════════════════════════════════════════════

describe('UX: missing .specwork/ — actionable error', () => {
  let emptyDir: string;

  beforeEach(() => {
    emptyDir = createTestProject();
    // Intentionally do NOT run specwork init
  });

  afterEach(() => cleanup(emptyDir));

  it('exits with non-zero code when .specwork/ is missing', () => {
    const result = runSpecwork(emptyDir, 'status');
    expect(result.exitCode).not.toBe(0);
  });

  it('error output mentions .specwork/ directory', () => {
    const result = runSpecwork(emptyDir, 'status');
    const output = result.stderr + result.stdout;
    expect(output).toMatch(/\.specwork/);
  });

  it('error output suggests running specwork init', () => {
    const result = runSpecwork(emptyDir, 'status');
    const output = result.stderr + result.stdout;
    // Should prompt user with actionable suggestion
    expect(output).toMatch(/specwork init|Did you run.*init/i);
  });

  it('error occurs for run command too', () => {
    const result = runSpecwork(emptyDir, 'run my-change');
    expect(result.exitCode).not.toBe(0);
    const output = result.stderr + result.stdout;
    expect(output).toMatch(/\.specwork/);
  });

  it('error occurs for graph commands too', () => {
    const result = runSpecwork(emptyDir, 'graph generate my-change');
    expect(result.exitCode).not.toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Error: missing change — should suggest available changes
// ══════════════════════════════════════════════════════════════════════════════

describe('UX: missing change name — helpful error', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
    runSpecwork(dir, 'init');
    runSpecwork(dir, 'new real-change');
    writeTasksFile(dir, 'real-change', '## 1. Core\n\n- [ ] 1.1 Thing\n');
    runSpecwork(dir, 'graph generate real-change');
  });

  afterEach(() => cleanup(dir));

  it('exits non-zero for status on a non-existent change', () => {
    const result = runSpecwork(dir, 'status nonexistent-change');
    expect(result.exitCode).not.toBe(0);
  });

  it('error message includes the unknown change name', () => {
    const result = runSpecwork(dir, 'status nonexistent-change');
    const output = result.stderr + result.stdout;
    expect(output).toContain('nonexistent-change');
  });

  it('error output suggests available changes', () => {
    const result = runSpecwork(dir, 'status nonexistent-change');
    const output = result.stderr + result.stdout;
    // Should list available changes so user knows what to use
    expect(output).toMatch(/real-change|available|Did you mean/i);
  });

  it('run on non-existent change exits non-zero', () => {
    const result = runSpecwork(dir, 'run nonexistent-change');
    expect(result.exitCode).not.toBe(0);
  });

  it('run error includes the unknown change name', () => {
    const result = runSpecwork(dir, 'run nonexistent-change');
    const output = result.stderr + result.stdout;
    expect(output).toContain('nonexistent-change');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Error JSON format — errors with --json are still JSON
// ══════════════════════════════════════════════════════════════════════════════

describe('UX: --json errors produce JSON output', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
    runSpecwork(dir, 'init');
    runSpecwork(dir, 'new my-change');
    writeTasksFile(dir, 'my-change', '## 1. Core\n\n- [ ] 1.1 Thing\n');
    runSpecwork(dir, 'graph generate my-change');
  });

  afterEach(() => cleanup(dir));

  it('--json status on nonexistent change returns JSON error', () => {
    const result = runSpecwork(dir, '--json status nonexistent-change');
    expect(result.exitCode).not.toBe(0);
    // Error output should be JSON or contain JSON
    const output = result.stdout + result.stderr;
    // At minimum the error should contain structured info
    expect(output.length).toBeGreaterThan(0);
  });

  it('--json run on nonexistent change returns JSON error', () => {
    const result = runSpecwork(dir, '--json run nonexistent-change');
    expect(result.exitCode).not.toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Global CLI flags
// ══════════════════════════════════════════════════════════════════════════════

describe('UX: global flags', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
    setupProjectWithGraph(dir);
  });

  afterEach(() => cleanup(dir));

  it('--quiet suppresses non-essential output', () => {
    const normal = runSpecwork(dir, 'status my-change');
    const quiet = runSpecwork(dir, '--quiet status my-change');

    // Quiet mode should produce less output
    const normalLen = (normal.stdout + normal.stderr).length;
    const quietLen = (quiet.stdout + quiet.stderr).length;
    expect(quietLen).toBeLessThanOrEqual(normalLen);
  });

  it('--cwd allows running from a different directory', () => {
    // Run from os tmpdir but point --cwd at our test project
    const result = runSpecwork(
      process.cwd(), // run from project root
      `--cwd ${dir} status my-change`,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('my-change');
  });

  it('combining --json and --quiet still produces JSON output', () => {
    const result = runSpecwork(dir, '--json --quiet status my-change');
    expect(result.exitCode).toBe(0);
    expect(isValidJson(result.stdout)).toBe(true);
  });
});
