import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { createTestProject, runSpecwork, cleanup, writeTasksFile } from '../integration/helpers.js';

const SIMPLE_TASKS = `## 1. Setup\n\n- [ ] 1.1 Initialize the module\n`;

function setupAndStartNode(dir: string, change = 'my-change', nodeId = 'write-tests') {
  runSpecwork(dir, 'init');
  runSpecwork(dir, `new ${change}`);
  writeTasksFile(dir, change, SIMPLE_TASKS);
  runSpecwork(dir, `graph generate ${change}`);
  // Override validate rules for testability with a simple file-exists check
  const graphFile = path.join(dir, '.specwork', 'graph', change, 'graph.yaml');
  const graph = parseYaml(fs.readFileSync(graphFile, 'utf-8')) as Record<string, unknown>;
  const nodes = graph.nodes as Array<Record<string, unknown>>;
  const node = nodes.find(n => n.id === nodeId);
  if (node) node.validate = [{ type: 'file-exists', args: { path: '.specwork/env/test-artifact.md' } }];
  fs.writeFileSync(graphFile, stringifyYaml(graph), 'utf-8');
  runSpecwork(dir, `node start ${change} ${nodeId}`);
}

describe('specwork node verify', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
  });

  afterEach(() => {
    cleanup(dir);
  });

  it('runs file-exists check and returns structured JSON verdict', () => {
    setupAndStartNode(dir);
    const result = runSpecwork(dir, '--json node verify my-change write-tests');
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.node).toBe('write-tests');
    expect(out.verdict).toBeDefined();
    expect(['PASS', 'FAIL']).toContain(out.verdict);
    expect(out.checks).toBeDefined();
    expect(Array.isArray(out.checks)).toBe(true);
  });

  it('returns PASS when all checks pass', () => {
    setupAndStartNode(dir);
    // Create the test artifact so the file-exists check passes
    const testArtifact = path.join(dir, '.specwork', 'env', 'test-artifact.md');
    fs.mkdirSync(path.dirname(testArtifact), { recursive: true });
    fs.writeFileSync(testArtifact, '# Test Artifact\n', 'utf-8');

    const result = runSpecwork(dir, '--json node verify my-change write-tests');
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.verdict).toBe('PASS');
  });

  it('returns FAIL when a check fails', () => {
    setupAndStartNode(dir);
    // Do not create test-artifact.md — file-exists check should fail
    const result = runSpecwork(dir, '--json node verify my-change write-tests');
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.verdict).toBe('FAIL');
    expect(out.checks.some((c: any) => c.status === 'FAIL')).toBe(true);
  });

  it('includes failure details in check results', () => {
    setupAndStartNode(dir);
    const result = runSpecwork(dir, '--json node verify my-change write-tests');
    const out = JSON.parse(result.stdout);
    if (out.verdict === 'FAIL') {
      const failedCheck = out.checks.find((c: any) => c.status === 'FAIL');
      expect(failedCheck).toBeDefined();
      expect(failedCheck.type).toBeDefined();
      expect(failedCheck.detail).toBeDefined();
    }
  });

  it('fails if node is not in_progress', () => {
    runSpecwork(dir, 'init');
    runSpecwork(dir, 'new my-change');
    writeTasksFile(dir, 'my-change', SIMPLE_TASKS);
    runSpecwork(dir, 'graph generate my-change');
    // Don't start the node
    const result = runSpecwork(dir, '--json node verify my-change write-tests');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/in.progress|started/i);
  });

  it('writes verify.md artifact to node directory', () => {
    setupAndStartNode(dir);
    const testArtifact = path.join(dir, '.specwork', 'env', 'test-artifact.md');
    fs.mkdirSync(path.dirname(testArtifact), { recursive: true });
    fs.writeFileSync(testArtifact, '# Test Artifact\n', 'utf-8');

    runSpecwork(dir, '--json node verify my-change write-tests');
    const verifyPath = path.join(dir, '.specwork', 'nodes', 'my-change', 'write-tests', 'verify.md');
    expect(fs.existsSync(verifyPath)).toBe(true);
    const content = fs.readFileSync(verifyPath, 'utf-8');
    expect(content).toMatch(/PASS|FAIL/);
  });

  it('runs successfully without --json flag', () => {
    setupAndStartNode(dir);
    const testArtifact = path.join(dir, '.specwork', 'env', 'test-artifact.md');
    fs.mkdirSync(path.dirname(testArtifact), { recursive: true });
    fs.writeFileSync(testArtifact, '# Test Artifact\n', 'utf-8');
    const result = runSpecwork(dir, 'node verify my-change write-tests');
    expect(result.exitCode).toBe(0);
    // verify.md should still be written
    const verifyPath = path.join(dir, '.specwork', 'nodes', 'my-change', 'write-tests', 'verify.md');
    expect(fs.existsSync(verifyPath)).toBe(true);
  });
});
