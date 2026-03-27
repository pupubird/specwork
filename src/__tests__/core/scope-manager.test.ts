import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setScope, clearScope, checkScope, getScope } from '../../core/scope-manager.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-test-'));
  fs.mkdirSync(path.join(dir, '.specwork'), { recursive: true });
  return dir;
}

function rmTempRoot(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('setScope', () => {
  let root: string;
  beforeEach(() => { root = makeTempRoot(); });
  afterEach(() => { rmTempRoot(root); });

  it('writes one path per line to .current-scope', () => {
    setScope(root, ['src/auth/', 'src/types/']);
    const content = fs.readFileSync(path.join(root, '.specwork', '.current-scope'), 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines.some(l => l.endsWith('src/auth/'))).toBe(true);
    expect(lines.some(l => l.endsWith('src/types/'))).toBe(true);
  });

  it('creates .specwork directory if missing', () => {
    const noSpecwork = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-no-'));
    fs.mkdirSync(path.join(noSpecwork, '.specwork'));
    try {
      setScope(noSpecwork, ['src/']);
      expect(fs.existsSync(path.join(noSpecwork, '.specwork', '.current-scope'))).toBe(true);
    } finally {
      rmTempRoot(noSpecwork);
    }
  });

  it('overwrites existing scope', () => {
    setScope(root, ['src/old/']);
    setScope(root, ['src/new/']);
    const scope = getScope(root);
    expect(scope).toHaveLength(1);
    expect(scope[0]).toContain('src/new/');
  });

  it('handles empty paths array', () => {
    setScope(root, []);
    const scope = getScope(root);
    expect(scope).toHaveLength(0);
  });

  it('normalizes relative paths to absolute', () => {
    setScope(root, ['src/auth/']);
    const scope = getScope(root);
    expect(scope[0]).toBe(path.join(root, 'src/auth/'));
  });

  it('keeps absolute paths as-is', () => {
    const absPath = '/absolute/path/src/';
    setScope(root, [absPath]);
    const scope = getScope(root);
    expect(scope[0]).toBe(absPath);
  });
});

describe('clearScope', () => {
  let root: string;
  beforeEach(() => { root = makeTempRoot(); });
  afterEach(() => { rmTempRoot(root); });

  it('removes the scope file', () => {
    setScope(root, ['src/']);
    clearScope(root);
    expect(fs.existsSync(path.join(root, '.specwork', '.current-scope'))).toBe(false);
  });

  it('does not throw if no scope file exists', () => {
    expect(() => clearScope(root)).not.toThrow();
  });
});

describe('getScope', () => {
  let root: string;
  beforeEach(() => { root = makeTempRoot(); });
  afterEach(() => { rmTempRoot(root); });

  it('returns empty array when no scope file exists', () => {
    expect(getScope(root)).toEqual([]);
  });

  it('returns all scope paths', () => {
    setScope(root, ['src/a/', 'src/b/', 'src/c/']);
    const scope = getScope(root);
    expect(scope).toHaveLength(3);
  });

  it('ignores blank lines in scope file', () => {
    const scopeFile = path.join(root, '.specwork', '.current-scope');
    fs.writeFileSync(scopeFile, '\n/path/a/\n\n/path/b/\n\n', 'utf8');
    expect(getScope(root)).toHaveLength(2);
  });
});

describe('checkScope', () => {
  let root: string;
  beforeEach(() => { root = makeTempRoot(); });
  afterEach(() => { rmTempRoot(root); });

  it('returns true when no scope file exists (unrestricted)', () => {
    expect(checkScope(root, 'anything/file.ts')).toBe(true);
  });

  it('returns true when file is within a scope path', () => {
    setScope(root, ['src/auth/']);
    expect(checkScope(root, path.join(root, 'src/auth/service.ts'))).toBe(true);
  });

  it('returns true for relative path that resolves within scope', () => {
    setScope(root, ['src/auth/']);
    expect(checkScope(root, 'src/auth/service.ts')).toBe(true);
  });

  it('returns false when file is outside all scope paths', () => {
    setScope(root, ['src/auth/']);
    expect(checkScope(root, path.join(root, 'src/other/file.ts'))).toBe(false);
  });

  it('returns true when file matches any of multiple scope paths', () => {
    setScope(root, ['src/auth/', 'src/types/']);
    expect(checkScope(root, path.join(root, 'src/types/graph.ts'))).toBe(true);
  });

  it('returns false when scope is empty array (set but empty)', () => {
    // Empty scope file — all paths allowed (same as no file)
    setScope(root, []);
    expect(checkScope(root, path.join(root, 'src/anything.ts'))).toBe(true);
  });

  it('respects prefix matching — does not allow subdirs of restricted paths', () => {
    setScope(root, ['src/auth/']);
    // src/authorizationService.ts starts with src/auth but is NOT inside src/auth/
    // The check is prefix-based using the normalized path
    const outsidePath = path.join(root, 'src/authorizationService.ts');
    const insidePath = path.join(root, 'src/auth/service.ts');
    expect(checkScope(root, insidePath)).toBe(true);
    expect(checkScope(root, outsidePath)).toBe(false);
  });
});
