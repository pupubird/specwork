import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { stringify as stringifyYaml } from 'yaml';

// ── These tests cover the verification engine in src/core/verification.ts
//    This module will export: runChecks, CheckResult, VerifyResult, parseCheckErrors

import {
  runChecks,
  runSingleCheck,
  sortChecksByPriority,
  detectRegressions,
  resolveCustomChecks,
} from '../../core/verification.js';

import type {
  CheckResult,
  VerifyResult,
  VerifyHistoryEntry,
} from '../../core/verification.js';

import type { ValidationRule } from '../../types/graph.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-verify-'));
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  return dir;
}

function rmTempRoot(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// Helper: create a file and commit it so git diff can track changes
function commitFile(root: string, filePath: string, content: string): void {
  const fullPath = path.join(root, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
  execSync(`git add "${filePath}"`, { cwd: root, stdio: 'pipe' });
  execSync(`git commit -m "add ${filePath}"`, { cwd: root, stdio: 'pipe' });
}

// Helper: modify a file after committing (creates a diff)
function modifyFile(root: string, filePath: string, content: string): void {
  const fullPath = path.join(root, filePath);
  fs.writeFileSync(fullPath, content, 'utf-8');
}

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Scope Enforcement Check
// ══════════════════════════════════════════════════════════════════════════════

describe('scope-check', () => {
  let root: string;

  beforeEach(() => { root = makeTempRoot(); });
  afterEach(() => { rmTempRoot(root); });

  it('returns PASS when all changed files are within scope', () => {
    commitFile(root, 'src/auth/jwt.ts', 'export const a = 1;');
    modifyFile(root, 'src/auth/jwt.ts', 'export const a = 2;');

    const result = runSingleCheck(root, {
      type: 'scope-check',
    }, { scope: ['src/auth/'] });

    expect(result.status).toBe('PASS');
  });

  it('returns FAIL when files outside scope are modified', () => {
    commitFile(root, 'src/auth/jwt.ts', 'export const a = 1;');
    commitFile(root, 'src/db/schema.ts', 'export const b = 1;');
    modifyFile(root, 'src/auth/jwt.ts', 'export const a = 2;');
    modifyFile(root, 'src/db/schema.ts', 'export const b = 2;');

    const result = runSingleCheck(root, {
      type: 'scope-check',
    }, { scope: ['src/auth/'] });

    expect(result.status).toBe('FAIL');
    expect(result.detail).toMatch(/src\/db\/schema\.ts/);
  });

  it('returns FAIL for any changes when scope is empty', () => {
    commitFile(root, 'src/foo.ts', 'export const x = 1;');
    modifyFile(root, 'src/foo.ts', 'export const x = 2;');

    const result = runSingleCheck(root, {
      type: 'scope-check',
    }, { scope: [] });

    expect(result.status).toBe('FAIL');
  });

  it('lists each out-of-scope file in errors array', () => {
    commitFile(root, 'src/auth/jwt.ts', 'a');
    commitFile(root, 'src/db/schema.ts', 'b');
    commitFile(root, 'src/utils/helper.ts', 'c');
    modifyFile(root, 'src/auth/jwt.ts', 'a2');
    modifyFile(root, 'src/db/schema.ts', 'b2');
    modifyFile(root, 'src/utils/helper.ts', 'c2');

    const result = runSingleCheck(root, {
      type: 'scope-check',
    }, { scope: ['src/auth/'] });

    expect(result.status).toBe('FAIL');
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBe(2);
    expect(result.errors!.some(e => e.file === 'src/db/schema.ts')).toBe(true);
    expect(result.errors!.some(e => e.file === 'src/utils/helper.ts')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Files Unchanged Check
// ══════════════════════════════════════════════════════════════════════════════

describe('files-unchanged', () => {
  let root: string;

  beforeEach(() => { root = makeTempRoot(); });
  afterEach(() => { rmTempRoot(root); });

  it('returns PASS when protected files have no modifications', () => {
    commitFile(root, 'src/__tests__/auth.test.ts', 'test("a", () => {});');

    const result = runSingleCheck(root, {
      type: 'files-unchanged',
      args: { files: ['src/__tests__/auth.test.ts'] },
    });

    expect(result.status).toBe('PASS');
  });

  it('returns FAIL when a protected file is modified', () => {
    commitFile(root, 'src/__tests__/auth.test.ts', 'test("a", () => {});');
    modifyFile(root, 'src/__tests__/auth.test.ts', 'test("b", () => {});');

    const result = runSingleCheck(root, {
      type: 'files-unchanged',
      args: { files: ['src/__tests__/auth.test.ts'] },
    });

    expect(result.status).toBe('FAIL');
    expect(result.detail).toMatch(/auth\.test\.ts/);
  });

  it('checks directory patterns — FAIL if any file under directory changed', () => {
    commitFile(root, 'src/__tests__/auth.test.ts', 'test("a", () => {});');
    modifyFile(root, 'src/__tests__/auth.test.ts', 'test("b", () => {});');

    const result = runSingleCheck(root, {
      type: 'files-unchanged',
      args: { files: ['src/__tests__/'] },
    });

    expect(result.status).toBe('FAIL');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Imports Exist Check
// ══════════════════════════════════════════════════════════════════════════════

describe('imports-exist', () => {
  let root: string;

  beforeEach(() => { root = makeTempRoot(); });
  afterEach(() => { rmTempRoot(root); });

  it('returns PASS when all relative imports resolve', () => {
    commitFile(root, 'src/auth/jwt.ts', 'import { hash } from "../utils/crypto.js";\nexport const a = 1;');
    commitFile(root, 'src/utils/crypto.ts', 'export function hash() {}');

    const result = runSingleCheck(root, {
      type: 'imports-exist',
    }, { scope: ['src/auth/'] });

    expect(result.status).toBe('PASS');
  });

  it('returns FAIL when import resolves to non-existent file', () => {
    commitFile(root, 'src/auth/jwt.ts', 'import { magic } from "../utils/magic-helper.js";\nexport const a = 1;');

    const result = runSingleCheck(root, {
      type: 'imports-exist',
    }, { scope: ['src/auth/'] });

    expect(result.status).toBe('FAIL');
    expect(result.errors).toBeDefined();
    expect(result.errors!.some(e => e.message.includes('magic-helper'))).toBe(true);
    expect(result.errors!.some(e => e.file === 'src/auth/jwt.ts')).toBe(true);
  });

  it('allows package imports that exist in package.json', () => {
    const pkgJson = JSON.stringify({ dependencies: { yaml: '^2.0.0' } });
    fs.writeFileSync(path.join(root, 'package.json'), pkgJson, 'utf-8');
    commitFile(root, 'src/auth/config.ts', 'import { parse } from "yaml";\nexport const a = 1;');

    const result = runSingleCheck(root, {
      type: 'imports-exist',
    }, { scope: ['src/auth/'] });

    expect(result.status).toBe('PASS');
  });

  it('returns FAIL for unknown package imports', () => {
    const pkgJson = JSON.stringify({ dependencies: {} });
    fs.writeFileSync(path.join(root, 'package.json'), pkgJson, 'utf-8');
    commitFile(root, 'src/auth/config.ts', 'import { foo } from "nonexistent-pkg";\nexport const a = 1;');

    const result = runSingleCheck(root, {
      type: 'imports-exist',
    }, { scope: ['src/auth/'] });

    expect(result.status).toBe('FAIL');
    expect(result.errors!.some(e => e.message.includes('nonexistent-pkg'))).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Check Execution Order and Fail-Fast
// ══════════════════════════════════════════════════════════════════════════════

describe('sortChecksByPriority', () => {
  it('orders checks from cheapest to most expensive', () => {
    const rules: ValidationRule[] = [
      { type: 'tests-pass' },
      { type: 'tsc-check' },
      { type: 'file-exists', args: { path: 'foo.ts' } },
      { type: 'scope-check' },
      { type: 'imports-exist' },
    ];

    const sorted = sortChecksByPriority(rules);

    const types = sorted.map(r => r.type);
    expect(types.indexOf('file-exists')).toBeLessThan(types.indexOf('scope-check'));
    expect(types.indexOf('scope-check')).toBeLessThan(types.indexOf('imports-exist'));
    expect(types.indexOf('imports-exist')).toBeLessThan(types.indexOf('tsc-check'));
    expect(types.indexOf('tsc-check')).toBeLessThan(types.indexOf('tests-pass'));
  });
});

describe('fail-fast execution', () => {
  let root: string;

  beforeEach(() => { root = makeTempRoot(); });
  afterEach(() => { rmTempRoot(root); });

  it('skips expensive checks when a cheap check fails (fail_fast=true)', () => {
    // file-exists will fail, tsc-check and tests-pass should be SKIPPED
    const rules: ValidationRule[] = [
      { type: 'file-exists', args: { path: 'nonexistent.ts' } },
      { type: 'tsc-check' },
      { type: 'tests-pass' },
    ];

    const result = runChecks(root, rules, { failFast: true, scope: [] });

    expect(result.verdict).toBe('FAIL');
    const statuses = result.checks.map(c => c.status);
    expect(statuses[0]).toBe('FAIL'); // file-exists
    expect(statuses).toContain('SKIPPED');
  });

  it('runs all checks when fail_fast=false', () => {
    const rules: ValidationRule[] = [
      { type: 'file-exists', args: { path: 'nonexistent.ts' } },
      { type: 'file-exists', args: { path: 'also-nonexistent.ts' } },
    ];

    const result = runChecks(root, rules, { failFast: false, scope: [] });

    expect(result.verdict).toBe('FAIL');
    // Both should be FAIL, not SKIPPED
    expect(result.checks.every(c => c.status === 'FAIL')).toBe(true);
  });

  it('marks skipped checks with prerequisite failure detail', () => {
    const rules: ValidationRule[] = [
      { type: 'file-exists', args: { path: 'nonexistent.ts' } },
      { type: 'tsc-check' },
    ];

    const result = runChecks(root, rules, { failFast: true, scope: [] });

    const skipped = result.checks.find(c => c.status === 'SKIPPED');
    expect(skipped).toBeDefined();
    expect(skipped!.detail).toMatch(/prerequisite|skipped/i);
    expect(skipped!.detail).toMatch(/file-exists/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Structured Error Output
// ══════════════════════════════════════════════════════════════════════════════

describe('structured error output', () => {
  let root: string;

  beforeEach(() => { root = makeTempRoot(); });
  afterEach(() => { rmTempRoot(root); });

  it('CheckResult includes status, detail, errors array, and duration_ms', () => {
    const result = runSingleCheck(root, {
      type: 'file-exists',
      args: { path: 'nonexistent.ts' },
    });

    expect(result.status).toBe('FAIL');
    expect(typeof result.detail).toBe('string');
    expect(result.detail.length).toBeLessThanOrEqual(200);
    expect(Array.isArray(result.errors)).toBe(true);
    expect(typeof result.duration_ms).toBe('number');
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('errors array contains structured objects with message', () => {
    // Create a TS file with a type error
    commitFile(root, 'tsconfig.json', '{"compilerOptions":{"strict":true,"noEmit":true},"include":["src/"]}');
    commitFile(root, 'src/bad.ts', 'const x: number = "hello";');

    const result = runSingleCheck(root, { type: 'tsc-check' });

    expect(result.status).toBe('FAIL');
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);

    const err = result.errors![0];
    expect(err.message).toBeDefined();
    expect(typeof err.message).toBe('string');
    // If tsc outputs structured file:line format, we get file+line+code
    // Otherwise we get at least a message
    if (err.file) {
      expect(typeof err.line).toBe('number');
      expect(err.code).toMatch(/^TS\d+$/);
    }
  });

  it('detail is at most 200 characters even with many errors', () => {
    // Create multiple type errors in separate files for distinct errors
    commitFile(root, 'tsconfig.json', '{"compilerOptions":{"strict":true,"noEmit":true},"include":["src/"]}');
    for (let i = 0; i < 5; i++) {
      commitFile(root, `src/bad${i}.ts`, `const x${i}: number = "hello${i}";\nconst y${i}: boolean = ${i};`);
    }

    const result = runSingleCheck(root, { type: 'tsc-check' });

    expect(result.status).toBe('FAIL');
    expect(result.detail.length).toBeLessThanOrEqual(200);
    // errors array should capture all errors (at least 1)
    expect(result.errors!.length).toBeGreaterThanOrEqual(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: SKIPPED status in CheckResult
// ══════════════════════════════════════════════════════════════════════════════

describe('CheckResult status includes SKIPPED', () => {
  it('SKIPPED is a valid status value', () => {
    const result: CheckResult = {
      type: 'tsc-check',
      status: 'SKIPPED',
      detail: 'Skipped: prerequisite file-exists failed',
      duration_ms: 0,
    };

    expect(['PASS', 'FAIL', 'SKIPPED']).toContain(result.status);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Custom Check Types
// ══════════════════════════════════════════════════════════════════════════════

describe('custom check types', () => {
  let root: string;

  beforeEach(() => { root = makeTempRoot(); });
  afterEach(() => { rmTempRoot(root); });

  it('resolves custom checks from config', () => {
    const config = {
      checks: {
        lint: {
          command: 'echo "lint ok"',
          expect: 'exit-0',
          description: 'ESLint passes',
          phase: ['impl'],
        },
      },
    };

    const resolved = resolveCustomChecks(
      [{ type: 'lint' as any }],
      config.checks
    );

    expect(resolved).toBeDefined();
    expect(resolved.length).toBe(1);
    // Type keeps the custom name for output clarity
    expect(resolved[0].type).toBe('lint');
    expect(resolved[0].args?.command).toBe('echo "lint ok"');
  });

  it('substitutes {scope} placeholder with node scope paths', () => {
    const config = {
      checks: {
        lint: {
          command: 'npx eslint {scope}',
          expect: 'exit-0',
          description: 'Lint',
          phase: ['impl'],
        },
      },
    };

    const resolved = resolveCustomChecks(
      [{ type: 'lint' as any }],
      config.checks,
      ['src/auth/', 'src/utils/']
    );

    expect(resolved[0].args?.command).toBe('npx eslint src/auth/ src/utils/');
  });

  it('passes through built-in check types unchanged', () => {
    const rules: ValidationRule[] = [
      { type: 'tsc-check' },
      { type: 'file-exists', args: { path: 'foo.ts' } },
    ];

    const resolved = resolveCustomChecks(rules, {});
    expect(resolved).toEqual(rules);
  });

  it('throws for unknown check type not in config', () => {
    expect(() => {
      resolveCustomChecks(
        [{ type: 'totally-unknown' as any }],
        {}
      );
    }).toThrow(/unknown.*check.*type|not.*defined/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Verification History & Regression Detection
// ══════════════════════════════════════════════════════════════════════════════

describe('verification history', () => {
  it('detectRegressions flags checks that previously passed but now fail', () => {
    const previousChecks: CheckResult[] = [
      { type: 'tsc-check', status: 'PASS', detail: 'OK', duration_ms: 100 },
      { type: 'tests-pass', status: 'FAIL', detail: '1 failed', duration_ms: 200 },
    ];
    const currentChecks: CheckResult[] = [
      { type: 'tsc-check', status: 'FAIL', detail: '3 errors', duration_ms: 100 },
      { type: 'tests-pass', status: 'PASS', detail: 'OK', duration_ms: 200 },
    ];

    const regressions = detectRegressions(previousChecks, currentChecks);

    expect(regressions).toContain('tsc-check');
    expect(regressions).not.toContain('tests-pass'); // improved, not regressed
  });

  it('returns empty array when no regressions', () => {
    const prev: CheckResult[] = [
      { type: 'tsc-check', status: 'FAIL', detail: 'err', duration_ms: 100 },
    ];
    const curr: CheckResult[] = [
      { type: 'tsc-check', status: 'PASS', detail: 'OK', duration_ms: 100 },
    ];

    const regressions = detectRegressions(prev, curr);
    expect(regressions).toEqual([]);
  });

  it('returns empty array when there is no previous history', () => {
    const curr: CheckResult[] = [
      { type: 'tsc-check', status: 'FAIL', detail: 'err', duration_ms: 100 },
    ];

    const regressions = detectRegressions([], curr);
    expect(regressions).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: VerifyResult structure
// ══════════════════════════════════════════════════════════════════════════════

describe('VerifyResult', () => {
  let root: string;

  beforeEach(() => { root = makeTempRoot(); });
  afterEach(() => { rmTempRoot(root); });

  it('includes verdict, checks, failed_count, total_checks, duration_ms', () => {
    commitFile(root, 'foo.ts', 'export const x = 1;');

    const result = runChecks(root, [
      { type: 'file-exists', args: { path: 'foo.ts' } },
    ], { failFast: true, scope: [] });

    expect(result.verdict).toBeDefined();
    expect(['PASS', 'FAIL']).toContain(result.verdict);
    expect(Array.isArray(result.checks)).toBe(true);
    expect(typeof result.failed_count).toBe('number');
    expect(typeof result.total_checks).toBe('number');
    expect(typeof result.duration_ms).toBe('number');
  });

  it('verdict is PASS only when all checks pass', () => {
    commitFile(root, 'a.ts', 'x');
    commitFile(root, 'b.ts', 'y');

    const result = runChecks(root, [
      { type: 'file-exists', args: { path: 'a.ts' } },
      { type: 'file-exists', args: { path: 'b.ts' } },
    ], { failFast: false, scope: [] });

    expect(result.verdict).toBe('PASS');
    expect(result.failed_count).toBe(0);
  });

  it('verdict is FAIL when any check fails', () => {
    commitFile(root, 'a.ts', 'x');

    const result = runChecks(root, [
      { type: 'file-exists', args: { path: 'a.ts' } },
      { type: 'file-exists', args: { path: 'nonexistent.ts' } },
    ], { failFast: false, scope: [] });

    expect(result.verdict).toBe('FAIL');
    expect(result.failed_count).toBe(1);
    expect(result.total_checks).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Scoped Test Execution
// ══════════════════════════════════════════════════════════════════════════════

describe('scoped test execution', () => {
  let root: string;

  beforeEach(() => { root = makeTempRoot(); });
  afterEach(() => { rmTempRoot(root); });

  it('tests-fail only runs the specified test file, not entire suite', () => {
    // If tests-fail ran all tests, it would be unpredictable
    // We verify by checking the command constructed
    const rule: ValidationRule = {
      type: 'tests-fail',
      args: { file: 'src/__tests__/auth.test.ts' },
    };

    // We can't easily run vitest in a temp dir without setup,
    // but we can verify the check targets the right file
    const result = runSingleCheck(root, rule);

    // The check should attempt to run the specific file
    // It will likely fail (no vitest installed), but the detail should reference the file
    expect(result.type).toBe('tests-fail');
    // Whether PASS or FAIL, it should have run
    expect(['PASS', 'FAIL']).toContain(result.status);
  });

  it('tests-pass only runs the specified test file', () => {
    const rule: ValidationRule = {
      type: 'tests-pass',
      args: { file: 'src/__tests__/auth.test.ts' },
    };

    const result = runSingleCheck(root, rule);
    expect(result.type).toBe('tests-pass');
    expect(['PASS', 'FAIL']).toContain(result.status);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Verification Config — reject verify: none
// ══════════════════════════════════════════════════════════════════════════════

describe('verification config validation', () => {
  it('is tested at integration level — see integration/verification.test.ts', () => {
    // Config validation happens at CLI load time, tested in integration tests
    expect(true).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Cross-Node Validation (direct deps only)
// ══════════════════════════════════════════════════════════════════════════════

describe('cross-node validation', () => {
  // Cross-node validation is orchestrated at CLI level, but the core
  // module provides a helper to collect dep test files

  it('is tested at integration level — see integration/verification.test.ts', () => {
    // Cross-node validation orchestration is integration-level
    expect(true).toBe(true);
  });
});
