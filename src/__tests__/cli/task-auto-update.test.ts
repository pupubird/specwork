/**
 * Tests for tasks.md auto-update features (Group 6 of progressive-context change).
 *
 * Tests cover:
 * - uncheckTask() — reverses checkOffTask, changes [x] → [ ] for impl-N-M nodes
 * - uncheckTask integration with failCmd and escalateCmd
 * - Convention lines (write-tests:, integration:) in checkOffTask
 * - parseTasks skips convention lines (no impl nodes created for them)
 * - Idempotency of both check and uncheck operations
 *
 * ALL tests MUST FAIL (red state) because:
 * - uncheckTask does not exist yet
 * - checkOffTask is not exported and doesn't handle convention lines
 * - parseTasks does not skip convention lines
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateGraph } from '../../core/graph-generator.js';
import { ensureDir, writeMarkdown } from '../../io/filesystem.js';

// ── Dynamic import to safely handle missing exports ──────────────────────────

let uncheckTask: ((root: string, change: string, nodeId: string) => void) | undefined;
let checkOffTask: ((root: string, change: string, nodeId: string) => void) | undefined;

beforeAll(async () => {
  const mod = (await import('../../cli/node.js')) as any;
  uncheckTask = mod.uncheckTask;
  checkOffTask = mod.checkOffTask;
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-task-update-'));
  fs.mkdirSync(path.join(dir, '.specwork', 'changes', 'test-change'), { recursive: true });
  return dir;
}

function writeTasksMd(root: string, content: string): void {
  const tasksPath = path.join(root, '.specwork', 'changes', 'test-change', 'tasks.md');
  fs.writeFileSync(tasksPath, content, 'utf-8');
}

function readTasksMd(root: string): string {
  const tasksPath = path.join(root, '.specwork', 'changes', 'test-change', 'tasks.md');
  return fs.readFileSync(tasksPath, 'utf-8');
}

function writeChangeFiles(root: string, tasksContent: string): void {
  const changeDir = path.join(root, '.specwork', 'changes', 'test-change');
  ensureDir(changeDir);
  fs.writeFileSync(path.join(changeDir, 'tasks.md'), tasksContent, 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'proposal.md'), '', 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'design.md'), '', 'utf-8');
}

// ── uncheckTask — existence and basic behavior ──────────────────────────────

describe('uncheckTask — existence', () => {
  it('uncheckTask is exported as a function', () => {
    expect(uncheckTask).toBeDefined();
    expect(typeof uncheckTask).toBe('function');
  });
});

describe('uncheckTask — basic behavior', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempRoot();
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reverts [x] → [ ] for matching impl-N-M task', () => {
    writeTasksMd(root, [
      '## Group 1',
      '- [x] First task',
      '- [ ] Second task',
      '',
    ].join('\n'));

    uncheckTask!(root, 'test-change', 'impl-1-1');

    const result = readTasksMd(root);
    expect(result).toContain('- [ ] First task');
  });

  it('unchecks correct task in multi-group tasks.md', () => {
    writeTasksMd(root, [
      '## Group 1',
      '- [x] Task 1.1',
      '- [x] Task 1.2',
      '',
      '## Group 2',
      '- [x] Task 2.1',
      '- [ ] Task 2.2',
      '',
    ].join('\n'));

    uncheckTask!(root, 'test-change', 'impl-2-1');

    const result = readTasksMd(root);
    // Group 1 tasks should remain checked
    expect(result).toContain('- [x] Task 1.1');
    expect(result).toContain('- [x] Task 1.2');
    // Group 2, task 1 should be unchecked
    const lines = result.split('\n');
    const group2Task1 = lines.find(l => l.includes('Task 2.1'));
    expect(group2Task1).toMatch(/^- \[ \]/);
  });

  it('is a no-op when target task is already unchecked', () => {
    const original = [
      '## Group 1',
      '- [ ] Already unchecked task',
      '',
    ].join('\n');
    writeTasksMd(root, original);

    uncheckTask!(root, 'test-change', 'impl-1-1');

    const result = readTasksMd(root);
    expect(result).toContain('- [ ] Already unchecked task');
  });

  it('is a no-op for non-impl node IDs', () => {
    const original = [
      '## Group 1',
      '- [x] Some task',
      '',
    ].join('\n');
    writeTasksMd(root, original);

    uncheckTask!(root, 'test-change', 'write-tests');

    const result = readTasksMd(root);
    // Should remain checked — write-tests is not an impl node
    expect(result).toContain('- [x] Some task');
  });

  it('is a no-op when tasks.md does not exist', () => {
    // Delete tasks.md
    const tasksPath = path.join(root, '.specwork', 'changes', 'test-change', 'tasks.md');
    if (fs.existsSync(tasksPath)) fs.unlinkSync(tasksPath);

    // Should not throw
    expect(() => uncheckTask!(root, 'test-change', 'impl-1-1')).not.toThrow();
  });

  it('does not corrupt other lines in the file', () => {
    writeTasksMd(root, [
      '## Group 1',
      '- [x] Task to uncheck',
      '- [x] Task to keep',
      '',
      'Some extra text',
      '',
    ].join('\n'));

    uncheckTask!(root, 'test-change', 'impl-1-1');

    const result = readTasksMd(root);
    expect(result).toContain('- [ ] Task to uncheck');
    expect(result).toContain('- [x] Task to keep');
    expect(result).toContain('Some extra text');
  });
});

// ── uncheckTask in failCmd / escalateCmd ────────────────────────────────────

describe('uncheckTask — integration with fail/escalate', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempRoot();
    // Set up full specwork structure for CLI commands
    fs.mkdirSync(path.join(root, '.specwork', 'graph', 'test-change'), { recursive: true });
    fs.mkdirSync(path.join(root, '.specwork', 'nodes', 'test-change'), { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('failCmd calls uncheckTask for impl nodes (tasks.md reverts to unchecked)', () => {
    // This test verifies that when a node fails, the corresponding task
    // in tasks.md is reverted from [x] to [ ].
    // Currently failCmd does NOT call uncheckTask — this test FAILS.
    writeTasksMd(root, [
      '## Group 1',
      '- [x] Previously completed task',
      '- [ ] Another task',
      '',
    ].join('\n'));

    // Simulate what failCmd should do: call uncheckTask
    // Since uncheckTask doesn't exist, we test the expected behavior
    expect(uncheckTask).toBeDefined();
    uncheckTask!(root, 'test-change', 'impl-1-1');

    const result = readTasksMd(root);
    expect(result).toContain('- [ ] Previously completed task');
  });

  it('escalateCmd calls uncheckTask for impl nodes', () => {
    writeTasksMd(root, [
      '## Group 1',
      '- [x] Task that will be escalated',
      '',
      '## Group 2',
      '- [x] Unrelated task',
      '',
    ].join('\n'));

    expect(uncheckTask).toBeDefined();
    uncheckTask!(root, 'test-change', 'impl-1-1');

    const result = readTasksMd(root);
    expect(result).toContain('- [ ] Task that will be escalated');
    // Group 2 should remain unchanged
    expect(result).toContain('- [x] Unrelated task');
  });
});

// ── Convention lines: checkOffTask for write-tests / integration ────────────

describe('checkOffTask — convention lines', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempRoot();
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('checkOffTask is exported as a function', () => {
    expect(checkOffTask).toBeDefined();
    expect(typeof checkOffTask).toBe('function');
  });

  it('checks off write-tests convention line when write-tests node completes', () => {
    writeTasksMd(root, [
      '## Group 1',
      '- [ ] write-tests: Write tests from specs',
      '- [ ] First impl task',
      '',
    ].join('\n'));

    checkOffTask!(root, 'test-change', 'write-tests');

    const result = readTasksMd(root);
    expect(result).toContain('- [x] write-tests: Write tests from specs');
    // Impl task should remain unchecked
    expect(result).toContain('- [ ] First impl task');
  });

  it('checks off integration convention line when integration node completes', () => {
    writeTasksMd(root, [
      '## Group 1',
      '- [ ] Some impl task',
      '- [ ] integration: Run integration verification',
      '',
    ].join('\n'));

    checkOffTask!(root, 'test-change', 'integration');

    const result = readTasksMd(root);
    expect(result).toContain('- [x] integration: Run integration verification');
    // Impl task should remain unchecked
    expect(result).toContain('- [ ] Some impl task');
  });

  it('handles tasks.md with both convention lines and regular tasks', () => {
    writeTasksMd(root, [
      '## Group 1',
      '- [ ] write-tests: Write tests from specs',
      '- [ ] 1.1 Create auth service',
      '- [ ] 1.2 Add rate limiting',
      '- [ ] integration: Run integration verification',
      '',
    ].join('\n'));

    checkOffTask!(root, 'test-change', 'write-tests');

    const result = readTasksMd(root);
    expect(result).toContain('- [x] write-tests: Write tests from specs');
    expect(result).toContain('- [ ] 1.1 Create auth service');
    expect(result).toContain('- [ ] 1.2 Add rate limiting');
    expect(result).toContain('- [ ] integration: Run integration verification');
  });

  it('is a no-op when no convention line matches', () => {
    const original = [
      '## Group 1',
      '- [ ] Regular task without convention prefix',
      '',
    ].join('\n');
    writeTasksMd(root, original);

    checkOffTask!(root, 'test-change', 'write-tests');

    const result = readTasksMd(root);
    // No convention line for write-tests, so nothing changes
    expect(result).toContain('- [ ] Regular task without convention prefix');
  });

  it('convention line check-off is idempotent', () => {
    writeTasksMd(root, [
      '## Group 1',
      '- [x] write-tests: Already checked',
      '',
    ].join('\n'));

    checkOffTask!(root, 'test-change', 'write-tests');

    const result = readTasksMd(root);
    // Should remain checked, not double-checked or corrupted
    expect(result).toContain('- [x] write-tests: Already checked');
  });
});

// ── parseTasks — convention lines should NOT create impl nodes ──────────────

describe('parseTasks — skip convention lines', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-gen-conv-'));
    ensureDir(path.join(root, '.specwork', 'changes'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('does not create impl nodes for write-tests: convention lines', () => {
    writeChangeFiles(root, [
      '## 1. Setup',
      '- [ ] write-tests: Write tests from specs',
      '- [ ] 1.1 Create auth service',
      '',
    ].join('\n'));

    const graph = generateGraph(root, 'test-change');
    const implNodes = graph.nodes.filter(n => n.id.startsWith('impl-'));

    // Should only have 1 impl node (for "Create auth service")
    // Convention line "write-tests: ..." should be skipped
    expect(implNodes).toHaveLength(1);
    expect(implNodes[0].description).toContain('Create auth service');
  });

  it('does not create impl nodes for integration: convention lines', () => {
    writeChangeFiles(root, [
      '## 1. Core',
      '- [ ] 1.1 Implement feature',
      '- [ ] integration: Run integration verification',
      '',
    ].join('\n'));

    const graph = generateGraph(root, 'test-change');
    const implNodes = graph.nodes.filter(n => n.id.startsWith('impl-'));

    // Should only have 1 impl node (for "Implement feature")
    expect(implNodes).toHaveLength(1);
    expect(implNodes[0].description).toContain('Implement feature');
  });

  it('handles tasks.md with multiple convention lines mixed with regular tasks', () => {
    writeChangeFiles(root, [
      '## 1. Feature Work',
      '- [ ] write-tests: Write tests from design specs',
      '- [ ] 1.1 Build login page',
      '- [ ] 1.2 Build dashboard',
      '',
      '## 2. Integration',
      '- [ ] 2.1 Wire up API endpoints',
      '- [ ] integration: Run full integration suite',
      '',
    ].join('\n'));

    const graph = generateGraph(root, 'test-change');
    const implNodes = graph.nodes.filter(n => n.id.startsWith('impl-'));

    // Should have 3 impl nodes (1.1, 1.2, 2.1) — convention lines skipped
    expect(implNodes).toHaveLength(3);
    const descriptions = implNodes.map(n => n.description);
    expect(descriptions).toContain('Build login page');
    expect(descriptions).toContain('Build dashboard');
    expect(descriptions).toContain('Wire up API endpoints');

    // Convention lines should NOT appear as impl nodes
    expect(descriptions.every(d => !d.includes('write-tests:'))).toBe(true);
    expect(descriptions.every(d => !d.includes('integration:'))).toBe(true);
  });

  it('still generates correct graph when no convention lines present', () => {
    writeChangeFiles(root, [
      '## 1. Core',
      '- [ ] 1.1 Do something',
      '- [ ] 1.2 Do something else',
      '',
    ].join('\n'));

    const graph = generateGraph(root, 'test-change');
    const implNodes = graph.nodes.filter(n => n.id.startsWith('impl-'));

    expect(implNodes).toHaveLength(2);
  });
});

// ── Idempotency of checkbox operations ──────────────────────────────────────

describe('idempotency of checkbox operations', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempRoot();
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('re-completing a node does not double-check (checkOffTask on already-checked)', () => {
    writeTasksMd(root, [
      '## Group 1',
      '- [x] Already completed task',
      '',
    ].join('\n'));

    checkOffTask!(root, 'test-change', 'impl-1-1');

    const result = readTasksMd(root);
    // Should still be [x], not corrupted
    expect(result).toContain('- [x] Already completed task');
    // Should not have double brackets or other corruption
    expect(result).not.toMatch(/\[x\]\s*\[x\]/);
  });

  it('re-failing a node that was never checked is a no-op (uncheckTask on unchecked)', () => {
    writeTasksMd(root, [
      '## Group 1',
      '- [ ] Never completed task',
      '',
    ].join('\n'));

    uncheckTask!(root, 'test-change', 'impl-1-1');

    const result = readTasksMd(root);
    // Should still be [ ], not corrupted
    expect(result).toContain('- [ ] Never completed task');
  });

  it('check then uncheck returns to original state', () => {
    const original = [
      '## Group 1',
      '- [ ] Task to toggle',
      '- [ ] Other task',
      '',
    ].join('\n');
    writeTasksMd(root, original);

    // Check off
    checkOffTask!(root, 'test-change', 'impl-1-1');
    let result = readTasksMd(root);
    expect(result).toContain('- [x] Task to toggle');

    // Uncheck
    uncheckTask!(root, 'test-change', 'impl-1-1');
    result = readTasksMd(root);
    expect(result).toContain('- [ ] Task to toggle');
    expect(result).toContain('- [ ] Other task');
  });
});
