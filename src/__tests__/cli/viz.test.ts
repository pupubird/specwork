import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createTestProject, runSpecwork, cleanup } from '../integration/helpers.js';
import { ensureDir } from '../../io/filesystem.js';

describe('specwork viz', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
    runSpecwork(dir, 'init');
  });

  afterEach(() => {
    cleanup(dir);
  });

  it('exits with error when change does not exist', () => {
    const result = runSpecwork(dir, 'viz nonexistent-change');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/not found|does not exist|no such change/i);
  });

  it('generates overview.html when it does not exist', () => {
    // Create a change with minimal files
    const changeName = 'test-viz';
    const changeDir = path.join(dir, '.specwork', 'changes', changeName);
    ensureDir(changeDir);
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '## Why\n\nFor testing.\n');
    fs.writeFileSync(path.join(changeDir, 'design.md'), '');
    fs.writeFileSync(path.join(changeDir, 'tasks.md'), '## 1. Setup\n- [ ] 1.1 Init project\n');
    fs.writeFileSync(
      path.join(changeDir, '.specwork.yaml'),
      'status: planning\ndescription: Test viz\n'
    );

    // Create a minimal graph
    const graphDir = path.join(dir, '.specwork', 'graph', changeName);
    ensureDir(graphDir);
    fs.writeFileSync(
      path.join(graphDir, 'graph.yaml'),
      `change: ${changeName}\nversion: "1"\ncreated_at: "2026-03-30"\nnodes:\n  - id: snapshot\n    type: deterministic\n    description: Take snapshot\n    deps: []\n    inputs: []\n    outputs: []\n    scope: []\n    validate: []\n    command: specwork snapshot\n`
    );

    const overviewPath = path.join(changeDir, 'overview.html');
    expect(fs.existsSync(overviewPath)).toBe(false);

    const result = runSpecwork(dir, `viz ${changeName}`);
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(overviewPath)).toBe(true);

    const html = fs.readFileSync(overviewPath, 'utf-8');
    expect(html).toMatch(/<html/i);
  });

  it('opens existing overview.html without regenerating', () => {
    const changeName = 'test-viz-open';
    const changeDir = path.join(dir, '.specwork', 'changes', changeName);
    ensureDir(changeDir);
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '## Why\n\nReason.\n');
    fs.writeFileSync(path.join(changeDir, 'design.md'), '');
    fs.writeFileSync(path.join(changeDir, 'tasks.md'), '');
    fs.writeFileSync(
      path.join(changeDir, '.specwork.yaml'),
      'status: planning\ndescription: Test\n'
    );

    // Pre-create overview.html with known content
    const overviewPath = path.join(changeDir, 'overview.html');
    const sentinel = '<!-- SENTINEL_EXISTING_FILE -->';
    fs.writeFileSync(overviewPath, `<html>${sentinel}</html>`);

    const result = runSpecwork(dir, `viz ${changeName}`);
    expect(result.exitCode).toBe(0);

    // File should NOT have been regenerated
    const html = fs.readFileSync(overviewPath, 'utf-8');
    expect(html).toContain(sentinel);
  });

  it('regenerates overview.html with --refresh flag', () => {
    const changeName = 'test-viz-refresh';
    const changeDir = path.join(dir, '.specwork', 'changes', changeName);
    ensureDir(changeDir);
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '## Why\n\nRefresh test.\n');
    fs.writeFileSync(path.join(changeDir, 'design.md'), '');
    fs.writeFileSync(path.join(changeDir, 'tasks.md'), '## 1. Task\n- [ ] 1.1 Do thing\n');
    fs.writeFileSync(
      path.join(changeDir, '.specwork.yaml'),
      'status: planning\ndescription: Refresh test\n'
    );

    // Create a minimal graph
    const graphDir = path.join(dir, '.specwork', 'graph', changeName);
    ensureDir(graphDir);
    fs.writeFileSync(
      path.join(graphDir, 'graph.yaml'),
      `change: ${changeName}\nversion: "1"\ncreated_at: "2026-03-30"\nnodes:\n  - id: snapshot\n    type: deterministic\n    description: Take snapshot\n    deps: []\n    inputs: []\n    outputs: []\n    scope: []\n    validate: []\n    command: specwork snapshot\n`
    );

    // Pre-create overview.html with sentinel
    const overviewPath = path.join(changeDir, 'overview.html');
    const sentinel = '<!-- OLD_CONTENT -->';
    fs.writeFileSync(overviewPath, `<html>${sentinel}</html>`);

    const result = runSpecwork(dir, `viz ${changeName} --refresh`);
    expect(result.exitCode).toBe(0);

    // File should have been regenerated (sentinel gone)
    const html = fs.readFileSync(overviewPath, 'utf-8');
    expect(html).not.toContain(sentinel);
    expect(html).toMatch(/<html/i);
  });
});
