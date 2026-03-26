/**
 * Integration tests for `specwork doctor` CLI command.
 *
 * RED state: the doctor command doesn't exist yet — all tests must fail.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestProject, runSpecwork, cleanup } from './helpers.js';
import fs from 'node:fs';
import path from 'node:path';

describe('specwork doctor', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
    runSpecwork(dir, 'init');
  });

  afterEach(() => {
    cleanup(dir);
  });

  it('exits with code 0 on a valid project', () => {
    const result = runSpecwork(dir, 'doctor');
    expect(result.exitCode).toBe(0);
  });

  it('exits with code 1 when errors exist', () => {
    // Remove config to cause a failure
    fs.unlinkSync(path.join(dir, '.specwork', 'config.yaml'));

    const result = runSpecwork(dir, 'doctor');
    expect(result.exitCode).toBe(1);
  });

  it('--fix applies fixable issues', () => {
    // Remove a template (fixable issue)
    fs.unlinkSync(path.join(dir, '.specwork', 'templates', 'proposal.md'));

    // First run should report errors
    const before = runSpecwork(dir, 'doctor');
    expect(before.exitCode).toBe(1);

    // Run with --fix
    const fixResult = runSpecwork(dir, 'doctor --fix');
    expect(fixResult.exitCode).toBe(0);
    expect(fixResult.stdout + fixResult.stderr).toMatch(/fix|applied|restored/i);

    // Template should now exist again
    expect(fs.existsSync(path.join(dir, '.specwork', 'templates', 'proposal.md'))).toBe(true);
  });

  it('--category specs only runs spec checks', () => {
    const result = runSpecwork(dir, '--json doctor --category specs');
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as { checks: Array<{ category: string }> };
    expect(parsed.checks).toHaveLength(1);
    expect(parsed.checks[0].category).toBe('Specs');
  });

  it('--json returns structured report', () => {
    const result = runSpecwork(dir, '--json doctor');
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed).toHaveProperty('checks');
    expect(parsed).toHaveProperty('totalPass');
    expect(parsed).toHaveProperty('totalFail');
    expect(parsed).toHaveProperty('totalFixable');
    expect(Array.isArray(parsed.checks)).toBe(true);
  });

  it('displays human-readable table output by default', () => {
    const result = runSpecwork(dir, 'doctor');
    expect(result.exitCode).toBe(0);
    // Table output should include category headers or check labels
    expect(result.stdout + result.stderr).toMatch(/config|specs|templates|archives/i);
  });
});
