/**
 * Tests for .claude/hooks/scope-guard.sh
 *
 * The hook is a PreToolUse bash script that:
 *   - Reads JSON from stdin (tool_input.file_path or tool_input.path)
 *   - Reads scope patterns from .foreman/.current-scope (one prefix per line)
 *   - Exits 2 (BLOCKED) if the file is outside scope
 *   - Exits 0 (allowed) if no scope file exists, or file is in scope
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOOK_PATH = path.resolve(__dirname, '../../../.claude/hooks/scope-guard.sh');
const SCOPE_FILE = '.foreman/.current-scope';

function runHook(
  json: object,
  cwd: string,
): { exitCode: number; stderr: string } {
  const result = spawnSync('bash', [HOOK_PATH], {
    input: JSON.stringify(json),
    cwd,
    encoding: 'utf-8',
  });
  return {
    exitCode: result.status ?? 1,
    stderr: result.stderr ?? '',
  };
}

function writeScopeFile(cwd: string, content: string): void {
  writeFileSync(path.join(cwd, SCOPE_FILE), content, 'utf8');
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'scope-guard-test-'));
  mkdirSync(path.join(tmpDir, '.foreman'), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── No scope file ─────────────────────────────────────────────────────────────

describe('scope-guard.sh — no scope file', () => {
  it('allows any file_path when .current-scope does not exist (exit 0)', () => {
    const result = runHook({ tool_input: { file_path: 'anything/file.ts' } }, tmpDir);
    expect(result.exitCode).toBe(0);
  });

  it('allows deeply nested path when no scope file (exit 0)', () => {
    const result = runHook({ tool_input: { file_path: 'src/deep/nested/module.ts' } }, tmpDir);
    expect(result.exitCode).toBe(0);
  });

  it('allows when JSON has no file_path key and no scope file (exit 0)', () => {
    const result = runHook({ tool_input: {} }, tmpDir);
    expect(result.exitCode).toBe(0);
  });
});

// ── In-scope writes ───────────────────────────────────────────────────────────

describe('scope-guard.sh — in-scope writes', () => {
  it('allows file_path that matches scope prefix (exit 0)', () => {
    writeScopeFile(tmpDir, 'src/\n');
    const result = runHook({ tool_input: { file_path: 'src/index.ts' } }, tmpDir);
    expect(result.exitCode).toBe(0);
  });

  it('allows deeply nested path within scope (exit 0)', () => {
    writeScopeFile(tmpDir, 'src/\n');
    const result = runHook({ tool_input: { file_path: 'src/core/deep/module.ts' } }, tmpDir);
    expect(result.exitCode).toBe(0);
  });

  it('allows file matching second of multiple scope patterns (exit 0)', () => {
    writeScopeFile(tmpDir, 'src/\nsrc/__tests__/\n');
    const result = runHook({ tool_input: { file_path: 'src/__tests__/foo.test.ts' } }, tmpDir);
    expect(result.exitCode).toBe(0);
  });

  it('allows file matching first of multiple scope patterns (exit 0)', () => {
    writeScopeFile(tmpDir, 'src/\ntests/\n');
    const result = runHook({ tool_input: { file_path: 'src/bar.ts' } }, tmpDir);
    expect(result.exitCode).toBe(0);
  });

  it('falls back to tool_input.path when file_path is absent (exit 0 for in-scope)', () => {
    writeScopeFile(tmpDir, 'src/\n');
    const result = runHook({ tool_input: { path: 'src/foo.ts' } }, tmpDir);
    expect(result.exitCode).toBe(0);
  });
});

// ── Out-of-scope writes ───────────────────────────────────────────────────────

describe('scope-guard.sh — out-of-scope writes', () => {
  it('blocks file_path outside scope with exit 2', () => {
    writeScopeFile(tmpDir, 'src/\n');
    const result = runHook({ tool_input: { file_path: 'lib/something.ts' } }, tmpDir);
    expect(result.exitCode).toBe(2);
  });

  it('includes BLOCKED in stderr when blocking', () => {
    writeScopeFile(tmpDir, 'src/\n');
    const result = runHook({ tool_input: { file_path: 'lib/something.ts' } }, tmpDir);
    expect(result.stderr).toContain('BLOCKED');
  });

  it('stderr includes the blocked file path', () => {
    writeScopeFile(tmpDir, 'src/\n');
    const result = runHook({ tool_input: { file_path: 'lib/evil.ts' } }, tmpDir);
    expect(result.stderr).toContain('lib/evil.ts');
  });

  it('blocks path that shares prefix but is not a child of scope (exit 2)', () => {
    // scope is "src/" — "src-extra/file.ts" starts with "src-", not "src/"
    writeScopeFile(tmpDir, 'src/\n');
    const result = runHook({ tool_input: { file_path: 'src-extra/file.ts' } }, tmpDir);
    expect(result.exitCode).toBe(2);
  });

  it('blocks tool_input.path outside scope (exit 2)', () => {
    writeScopeFile(tmpDir, 'src/\n');
    const result = runHook({ tool_input: { path: 'other/foo.ts' } }, tmpDir);
    expect(result.exitCode).toBe(2);
  });

  it('blocks file not matching any pattern when multiple patterns exist (exit 2)', () => {
    writeScopeFile(tmpDir, 'src/\ntests/\n');
    const result = runHook({ tool_input: { file_path: 'lib/baz.ts' } }, tmpDir);
    expect(result.exitCode).toBe(2);
  });
});

// ── Empty scope file ──────────────────────────────────────────────────────────

describe('scope-guard.sh — empty scope file', () => {
  it('blocks any path when scope file exists but is empty (exit 2)', () => {
    writeScopeFile(tmpDir, '');
    const result = runHook({ tool_input: { file_path: 'src/index.ts' } }, tmpDir);
    expect(result.exitCode).toBe(2);
  });

  it('blocks a different path when scope file is empty (exit 2)', () => {
    writeScopeFile(tmpDir, '');
    const result = runHook({ tool_input: { file_path: 'README.md' } }, tmpDir);
    expect(result.exitCode).toBe(2);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('scope-guard.sh — edge cases', () => {
  it('allows when file_path is absent and scope file exists (no path = allow)', () => {
    writeScopeFile(tmpDir, 'src/\n');
    // No file_path or path key — hook cannot determine the path, so it allows
    const result = runHook({ tool_input: {} }, tmpDir);
    expect(result.exitCode).toBe(0);
  });

  it('exits 0 (not an error) for in-scope .foreman/ internal files', () => {
    writeScopeFile(tmpDir, '.foreman/\n');
    const result = runHook({ tool_input: { file_path: '.foreman/graph/my-change/state.yaml' } }, tmpDir);
    expect(result.exitCode).toBe(0);
  });

  it('handles a scope pattern that is an exact file prefix match', () => {
    writeScopeFile(tmpDir, 'src/core/graph-generator.ts\n');
    const inScope = runHook({ tool_input: { file_path: 'src/core/graph-generator.ts' } }, tmpDir);
    expect(inScope.exitCode).toBe(0);
  });
});
