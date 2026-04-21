import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createTestProject, runSpecwork, cleanup, writeTasksFile } from '../integration/helpers.js';

const SIMPLE_TASKS = `## 1. Setup\n\n- [ ] 1.1 Initialize the module\n`;

function setupAndStartNode(dir: string, change = 'my-change', nodeId = 'write-tests') {
  runSpecwork(dir, 'init');
  runSpecwork(dir, `new ${change}`);
  writeTasksFile(dir, change, SIMPLE_TASKS);
  runSpecwork(dir, `graph generate ${change}`);
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

  it('records PASS verdict and returns JSON with next_action', () => {
    setupAndStartNode(dir);
    const result = runSpecwork(dir, '--json node verify my-change write-tests');
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.node).toBe('write-tests');
    expect(out.verdict).toBe('PASS');
    expect(out.next_action).toBeDefined();
  });

  it('sets verified=true in state after verify', () => {
    setupAndStartNode(dir);
    runSpecwork(dir, '--json node verify my-change write-tests');
    const statePath = path.join(dir, '.specwork', 'graph', 'my-change', 'state.yaml');
    const raw = fs.readFileSync(statePath, 'utf-8');
    expect(raw).toMatch(/verified:\s*true/);
  });

  it('writes verify.md artifact to node directory', () => {
    setupAndStartNode(dir);
    runSpecwork(dir, '--json node verify my-change write-tests');
    const verifyPath = path.join(dir, '.specwork', 'nodes', 'my-change', 'write-tests', 'verify.md');
    expect(fs.existsSync(verifyPath)).toBe(true);
    const content = fs.readFileSync(verifyPath, 'utf-8');
    expect(content).toMatch(/PASS/);
  });

  it('fails if node is not in_progress', () => {
    runSpecwork(dir, 'init');
    runSpecwork(dir, 'new my-change');
    writeTasksFile(dir, 'my-change', SIMPLE_TASKS);
    runSpecwork(dir, 'graph generate my-change');
    const result = runSpecwork(dir, '--json node verify my-change write-tests');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/in.progress|started/i);
  });

  it('runs successfully without --json flag', () => {
    setupAndStartNode(dir);
    const result = runSpecwork(dir, 'node verify my-change write-tests');
    expect(result.exitCode).toBe(0);
  });
});
