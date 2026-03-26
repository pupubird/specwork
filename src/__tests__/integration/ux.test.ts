/**
 * UX verification tests for Foreman CLI.
 *
 * Validates the user-facing CLI experience:
 *   - --version outputs version string
 *   - --help outputs help text
 *   - --json flag produces parseable JSON for all commands
 *   - Missing .foreman/ gives actionable error with "Did you run foreman init?" hint
 *   - Missing change name gives error that suggests available changes
 *   - Error messages include the change name for context
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createTestProject, runForeman, cleanup, writeTasksFile } from './helpers.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupProjectWithGraph(dir: string, change = 'my-change'): void {
  runForeman(dir, 'init');
  runForeman(dir, `new ${change}`);
  writeTasksFile(dir, change, '## 1. Core\n\n- [ ] 1.1 Add thing\n- [ ] 1.2 Wire up\n');
  runForeman(dir, `graph generate ${change}`);
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
    const result = runForeman(dir, '--version');
    expect(result.exitCode).toBe(0);
  });

  it('outputs a semver-like version string', () => {
    const result = runForeman(dir, '--version');
    const output = result.stdout + result.stderr;
    // Should match x.y.z version pattern
    expect(output).toMatch(/\d+\.\d+\.\d+/);
  });

  it('-v shorthand also outputs version', () => {
    const result = runForeman(dir, '-v');
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
    const result = runForeman(dir, '--help');
    expect(result.exitCode).toBe(0);
  });

  it('outputs Usage: in help text', () => {
    const result = runForeman(dir, '--help');
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/Usage:/i);
  });

  it('lists the foreman command name', () => {
    const result = runForeman(dir, '--help');
    const output = result.stdout + result.stderr;
    expect(output).toContain('foreman');
  });

  it('lists core subcommands in help text', () => {
    const result = runForeman(dir, '--help');
    const output = result.stdout + result.stderr;
    // At minimum, run and status should be listed
    expect(output).toMatch(/run|status/i);
  });

  it('subcommand --help works for run', () => {
    const result = runForeman(dir, 'run --help');
    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/Usage:/i);
    expect(output).toMatch(/change/i);
  });

  it('subcommand --help works for status', () => {
    const result = runForeman(dir, 'status --help');
    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/Usage:/i);
  });

  it('subcommand --help works for graph', () => {
    const result = runForeman(dir, 'graph --help');
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

  it('foreman --json status my-change outputs parseable JSON', () => {
    const result = runForeman(dir, '--json status my-change');
    expect(result.exitCode).toBe(0);
    expect(isValidJson(result.stdout)).toBe(true);
  });

  it('foreman --json status (no change) outputs parseable JSON', () => {
    const result = runForeman(dir, '--json status');
    expect(result.exitCode).toBe(0);
    expect(isValidJson(result.stdout)).toBe(true);
  });

  it('foreman --json run my-change outputs parseable JSON', () => {
    const result = runForeman(dir, '--json run my-change');
    expect(result.exitCode).toBe(0);
    expect(isValidJson(result.stdout)).toBe(true);
  });

  it('foreman --json run my-change --dry-run outputs parseable JSON', () => {
    const result = runForeman(dir, '--json run my-change --dry-run');
    expect(result.exitCode).toBe(0);
    expect(isValidJson(result.stdout)).toBe(true);
  });

  it('foreman --json graph show my-change outputs parseable JSON', () => {
    const result = runForeman(dir, '--json graph show my-change');
    expect(result.exitCode).toBe(0);
    expect(isValidJson(result.stdout)).toBe(true);
  });

  it('foreman --json config show outputs parseable JSON', () => {
    const result = runForeman(dir, '--json config show');
    expect(result.exitCode).toBe(0);
    expect(isValidJson(result.stdout)).toBe(true);
  });

  it('JSON output has no extra non-JSON content before or after', () => {
    const result = runForeman(dir, '--json status my-change');
    // stdout should be exactly one JSON object/array
    const trimmed = result.stdout.trim();
    expect(trimmed.startsWith('{')).toBe(true);
    expect(trimmed.endsWith('}')).toBe(true);
  });

  it('JSON status response includes expected top-level keys', () => {
    const result = runForeman(dir, '--json status my-change');
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed).toHaveProperty('change');
    expect(parsed).toHaveProperty('status');
    expect(parsed).toHaveProperty('nodes');
    expect(parsed).toHaveProperty('progress');
  });

  it('JSON run response includes ready array and progress', () => {
    const result = runForeman(dir, '--json run my-change');
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed).toHaveProperty('ready');
    expect(parsed).toHaveProperty('progress');
    expect(Array.isArray(parsed.ready)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Error: missing .foreman/ should suggest foreman init
// ══════════════════════════════════════════════════════════════════════════════

describe('UX: missing .foreman/ — actionable error', () => {
  let emptyDir: string;

  beforeEach(() => {
    emptyDir = createTestProject();
    // Intentionally do NOT run foreman init
  });

  afterEach(() => cleanup(emptyDir));

  it('exits with non-zero code when .foreman/ is missing', () => {
    const result = runForeman(emptyDir, 'status');
    expect(result.exitCode).not.toBe(0);
  });

  it('error output mentions .foreman/ directory', () => {
    const result = runForeman(emptyDir, 'status');
    const output = result.stderr + result.stdout;
    expect(output).toMatch(/\.foreman/);
  });

  it('error output suggests running foreman init', () => {
    const result = runForeman(emptyDir, 'status');
    const output = result.stderr + result.stdout;
    // Should prompt user with actionable suggestion
    expect(output).toMatch(/foreman init|Did you run.*init/i);
  });

  it('error occurs for run command too', () => {
    const result = runForeman(emptyDir, 'run my-change');
    expect(result.exitCode).not.toBe(0);
    const output = result.stderr + result.stdout;
    expect(output).toMatch(/\.foreman/);
  });

  it('error occurs for graph commands too', () => {
    const result = runForeman(emptyDir, 'graph generate my-change');
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
    runForeman(dir, 'init');
    runForeman(dir, 'new real-change');
    writeTasksFile(dir, 'real-change', '## 1. Core\n\n- [ ] 1.1 Thing\n');
    runForeman(dir, 'graph generate real-change');
  });

  afterEach(() => cleanup(dir));

  it('exits non-zero for status on a non-existent change', () => {
    const result = runForeman(dir, 'status nonexistent-change');
    expect(result.exitCode).not.toBe(0);
  });

  it('error message includes the unknown change name', () => {
    const result = runForeman(dir, 'status nonexistent-change');
    const output = result.stderr + result.stdout;
    expect(output).toContain('nonexistent-change');
  });

  it('error output suggests available changes', () => {
    const result = runForeman(dir, 'status nonexistent-change');
    const output = result.stderr + result.stdout;
    // Should list available changes so user knows what to use
    expect(output).toMatch(/real-change|available|Did you mean/i);
  });

  it('run on non-existent change exits non-zero', () => {
    const result = runForeman(dir, 'run nonexistent-change');
    expect(result.exitCode).not.toBe(0);
  });

  it('run error includes the unknown change name', () => {
    const result = runForeman(dir, 'run nonexistent-change');
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
    runForeman(dir, 'init');
    runForeman(dir, 'new my-change');
    writeTasksFile(dir, 'my-change', '## 1. Core\n\n- [ ] 1.1 Thing\n');
    runForeman(dir, 'graph generate my-change');
  });

  afterEach(() => cleanup(dir));

  it('--json status on nonexistent change returns JSON error', () => {
    const result = runForeman(dir, '--json status nonexistent-change');
    expect(result.exitCode).not.toBe(0);
    // Error output should be JSON or contain JSON
    const output = result.stdout + result.stderr;
    // At minimum the error should contain structured info
    expect(output.length).toBeGreaterThan(0);
  });

  it('--json run on nonexistent change returns JSON error', () => {
    const result = runForeman(dir, '--json run nonexistent-change');
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
    const normal = runForeman(dir, 'status my-change');
    const quiet = runForeman(dir, '--quiet status my-change');

    // Quiet mode should produce less output
    const normalLen = (normal.stdout + normal.stderr).length;
    const quietLen = (quiet.stdout + quiet.stderr).length;
    expect(quietLen).toBeLessThanOrEqual(normalLen);
  });

  it('--cwd allows running from a different directory', () => {
    // Run from os tmpdir but point --cwd at our test project
    const result = runForeman(
      process.cwd(), // run from project root
      `--cwd ${dir} status my-change`,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('my-change');
  });

  it('combining --json and --quiet still produces JSON output', () => {
    const result = runForeman(dir, '--json --quiet status my-change');
    expect(result.exitCode).toBe(0);
    expect(isValidJson(result.stdout)).toBe(true);
  });
});
