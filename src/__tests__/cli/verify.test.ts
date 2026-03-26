import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { createTestProject, runForeman, cleanup, writeTasksFile } from '../integration/helpers.js';

const SIMPLE_TASKS = `## 1. Setup\n\n- [ ] 1.1 Initialize the module\n`;

function setupAndStartNode(dir: string, change = 'my-change', nodeId = 'snapshot') {
  runForeman(dir, 'init');
  runForeman(dir, `new ${change}`);
  writeTasksFile(dir, change, SIMPLE_TASKS);
  runForeman(dir, `graph generate ${change}`);
  runForeman(dir, `node start ${change} ${nodeId}`);
}

describe('foreman node verify', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
  });

  afterEach(() => {
    cleanup(dir);
  });

  it('runs tsc-check and returns structured JSON verdict', () => {
    setupAndStartNode(dir);
    const result = runForeman(dir, '--json node verify my-change snapshot');
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.node).toBe('snapshot');
    expect(out.verdict).toBeDefined();
    expect(['PASS', 'FAIL']).toContain(out.verdict);
    expect(out.checks).toBeDefined();
    expect(Array.isArray(out.checks)).toBe(true);
  });

  it('returns PASS when all checks pass', () => {
    setupAndStartNode(dir);
    // snapshot node has validate: [{ type: "file-exists", args: { path: ".foreman/env/snapshot.md" } }]
    // Create the file so the check passes
    const snapshotPath = path.join(dir, '.foreman', 'env', 'snapshot.md');
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(snapshotPath, '# Snapshot\n', 'utf-8');

    const result = runForeman(dir, '--json node verify my-change snapshot');
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.verdict).toBe('PASS');
  });

  it('returns FAIL when a check fails', () => {
    setupAndStartNode(dir);
    // snapshot node validates file-exists for .foreman/env/snapshot.md
    // Don't create it — check should fail
    const result = runForeman(dir, '--json node verify my-change snapshot');
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.verdict).toBe('FAIL');
    expect(out.checks.some((c: any) => c.status === 'FAIL')).toBe(true);
  });

  it('includes failure details in check results', () => {
    setupAndStartNode(dir);
    const result = runForeman(dir, '--json node verify my-change snapshot');
    const out = JSON.parse(result.stdout);
    if (out.verdict === 'FAIL') {
      const failedCheck = out.checks.find((c: any) => c.status === 'FAIL');
      expect(failedCheck).toBeDefined();
      expect(failedCheck.type).toBeDefined();
      expect(failedCheck.detail).toBeDefined();
    }
  });

  it('fails if node is not in_progress', () => {
    runForeman(dir, 'init');
    runForeman(dir, 'new my-change');
    writeTasksFile(dir, 'my-change', SIMPLE_TASKS);
    runForeman(dir, 'graph generate my-change');
    // Don't start the node
    const result = runForeman(dir, '--json node verify my-change snapshot');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/in.progress|started/i);
  });

  it('writes verify.md artifact to node directory', () => {
    setupAndStartNode(dir);
    fs.mkdirSync(path.join(dir, '.foreman', 'env'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.foreman', 'env', 'snapshot.md'), '# Snapshot\n', 'utf-8');

    runForeman(dir, '--json node verify my-change snapshot');
    const verifyPath = path.join(dir, '.foreman', 'nodes', 'my-change', 'snapshot', 'verify.md');
    expect(fs.existsSync(verifyPath)).toBe(true);
    const content = fs.readFileSync(verifyPath, 'utf-8');
    expect(content).toMatch(/PASS|FAIL/);
  });

  it('outputs human-readable text without --json', () => {
    setupAndStartNode(dir);
    const result = runForeman(dir, 'node verify my-change snapshot');
    expect(result.exitCode).toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/PASS|FAIL|verify/i);
  });
});
