import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

// ── These tests cover the no-todos verification check
//    This check will be added to src/core/verification.ts as a built-in check type
//    It scans git diffs for deferred work patterns (TODO, FIXME, STUB, etc.)

import {
  runSingleCheck,
  runChecks,
} from '../../core/verification.js';

import type { CheckResult } from '../../core/verification.js';
import type { ValidationRule } from '../../types/graph.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-no-todos-'));
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  return dir;
}

function rmTempRoot(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function commitFile(root: string, filePath: string, content: string): void {
  const fullPath = path.join(root, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
  execSync(`git add "${filePath}"`, { cwd: root, stdio: 'pipe' });
  execSync(`git commit -m "add ${filePath}"`, { cwd: root, stdio: 'pipe' });
}

function modifyFile(root: string, filePath: string, content: string): void {
  const fullPath = path.join(root, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
}

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: No-Todos Verification Check Blocks Deferred Work
// ══════════════════════════════════════════════════════════════════════════════

describe('no-todos check', () => {
  let root: string;

  beforeEach(() => { root = makeTempRoot(); });
  afterEach(() => { rmTempRoot(root); });

  // ── Scenario: Check detects TODO in implementation file ───────────────────

  it('returns FAIL when diff contains a TODO comment', () => {
    commitFile(root, 'src/auth/jwt.ts', 'export function verify() { return true; }');
    modifyFile(root, 'src/auth/jwt.ts', 'export function verify() {\n  // TODO: implement this\n  return true;\n}');

    const result = runSingleCheck(root, { type: 'no-todos' });

    expect(result.status).toBe('FAIL');
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    // Output MUST include file name and line number
    expect(result.errors!.some(e => e.file === 'src/auth/jwt.ts')).toBe(true);
    expect(result.errors!.some(e => typeof e.line === 'number')).toBe(true);
  });

  // ── Scenario: Check detects FIXME pattern ─────────────────────────────────

  it('returns FAIL when diff contains a FIXME comment', () => {
    commitFile(root, 'src/core/engine.ts', 'export const run = () => {};');
    modifyFile(root, 'src/core/engine.ts', 'export const run = () => {\n  // FIXME: broken\n};');

    const result = runSingleCheck(root, { type: 'no-todos' });

    expect(result.status).toBe('FAIL');
    // Must detect the pattern, not just be an unknown type error
    expect(result.detail).not.toMatch(/unknown.*check.*type/i);
    expect(result.errors!.some(e => e.file === 'src/core/engine.ts')).toBe(true);
  });

  // ── Scenario: Check detects stub/placeholder patterns ─────────────────────

  it('returns FAIL when diff contains STUB pattern', () => {
    commitFile(root, 'src/utils/helper.ts', 'export function help() {}');
    modifyFile(root, 'src/utils/helper.ts', 'export function help() {\n  // STUB\n  return null;\n}');

    const result = runSingleCheck(root, { type: 'no-todos' });

    expect(result.status).toBe('FAIL');
    expect(result.detail).not.toMatch(/unknown.*check.*type/i);
    expect(result.errors!.some(e => e.file === 'src/utils/helper.ts')).toBe(true);
  });

  it('returns FAIL when diff contains PLACEHOLDER pattern', () => {
    commitFile(root, 'src/utils/data.ts', 'export const data = {};');
    modifyFile(root, 'src/utils/data.ts', 'export const data = {\n  // PLACEHOLDER\n  value: null,\n};');

    const result = runSingleCheck(root, { type: 'no-todos' });

    expect(result.status).toBe('FAIL');
    expect(result.detail).not.toMatch(/unknown.*check.*type/i);
    expect(result.errors!.some(e => e.file === 'src/utils/data.ts')).toBe(true);
  });

  it('returns FAIL when diff contains NOT_IMPLEMENTED pattern', () => {
    commitFile(root, 'src/core/parser.ts', 'export function parse() {}');
    modifyFile(root, 'src/core/parser.ts', 'export function parse() {\n  // NOT_IMPLEMENTED\n  return;\n}');

    const result = runSingleCheck(root, { type: 'no-todos' });

    expect(result.status).toBe('FAIL');
    expect(result.detail).not.toMatch(/unknown.*check.*type/i);
    expect(result.errors!.some(e => e.file === 'src/core/parser.ts')).toBe(true);
  });

  it('returns FAIL when diff contains throw new Error not implemented', () => {
    commitFile(root, 'src/core/handler.ts', 'export function handle() {}');
    modifyFile(root, 'src/core/handler.ts', "export function handle() {\n  throw new Error('not implemented');\n}");

    const result = runSingleCheck(root, { type: 'no-todos' });

    expect(result.status).toBe('FAIL');
    expect(result.detail).not.toMatch(/unknown.*check.*type/i);
    expect(result.errors!.some(e => e.file === 'src/core/handler.ts')).toBe(true);
  });

  // ── Scenario: Check passes on clean diff ──────────────────────────────────

  it('returns PASS when diff contains no deferred work patterns', () => {
    commitFile(root, 'src/auth/jwt.ts', 'export function verify() { return true; }');
    modifyFile(root, 'src/auth/jwt.ts', 'export function verify(token: string) {\n  return token.length > 0;\n}');

    const result = runSingleCheck(root, { type: 'no-todos' });

    expect(result.status).toBe('PASS');
  });

  // ── Scenario: Check ignores .specwork/ directory ──────────────────────────

  it('returns PASS when TODO is only in .specwork/ files', () => {
    commitFile(root, '.specwork/specs/auth.md', '# Auth Spec');
    modifyFile(root, '.specwork/specs/auth.md', '# Auth Spec\n\n// TODO: this is a spec discussion, not deferred work');

    const result = runSingleCheck(root, { type: 'no-todos' });

    expect(result.status).toBe('PASS');
  });

  it('does not report .specwork/ files in errors', () => {
    commitFile(root, '.specwork/proposal.md', '# Proposal');
    commitFile(root, 'src/core/engine.ts', 'export const run = () => {};');
    modifyFile(root, '.specwork/proposal.md', '# Proposal\n\nTODO: discuss this');
    modifyFile(root, 'src/core/engine.ts', 'export const run = () => {\n  // TODO: fix later\n};');

    const result = runSingleCheck(root, { type: 'no-todos' });

    expect(result.status).toBe('FAIL');
    // The error should reference src/core/engine.ts but NOT .specwork/proposal.md
    expect(result.errors!.some(e => e.file === 'src/core/engine.ts')).toBe(true);
    expect(result.errors!.every(e => !e.file?.startsWith('.specwork/'))).toBe(true);
  });

  // ── Scenario: Check runs automatically without configuration ──────────────

  it('no-todos is recognized as a built-in check type', () => {
    commitFile(root, 'src/clean.ts', 'export const clean = true;');
    modifyFile(root, 'src/clean.ts', 'export const clean = false;');

    // Running no-todos as a single check should work without custom config
    const result = runSingleCheck(root, { type: 'no-todos' });

    // It should return a valid CheckResult (not an "unknown check type" error)
    expect(result.type).toBe('no-todos');
    expect(['PASS', 'FAIL']).toContain(result.status);
    // Must not have an error about unknown check type
    expect(result.detail).not.toMatch(/unknown.*check.*type/i);
  });

  it('no-todos runs as a default check in runChecks even when not listed', () => {
    commitFile(root, 'src/impl.ts', 'export const x = 1;');
    modifyFile(root, 'src/impl.ts', 'export const x = 1;\n// TODO: finish this');

    // Run checks with only file-exists — no-todos should still run as a default
    const result = runChecks(root, [
      { type: 'file-exists', args: { path: 'src/impl.ts' } },
    ], { failFast: false, scope: ['src/'] });

    // The no-todos check should appear in the checks array automatically
    const noTodosCheck = result.checks.find(c => c.type === 'no-todos');
    expect(noTodosCheck).toBeDefined();
    expect(noTodosCheck!.status).toBe('FAIL');
  });
});
