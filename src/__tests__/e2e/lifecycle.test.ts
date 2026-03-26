/**
 * Full lifecycle E2E test — exercises every major workflow step in order:
 *   init → new → graph generate → graph validate → run → node start/complete
 *   → status → run (next) → snapshot → context l0
 *
 * All interactions use core module APIs (same pattern as other tests in this
 * project). No subprocess spawning required.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ── core modules ────────────────────────────────────────────────────────────
import { generateGraph } from '../../core/graph-generator.js';
import { validateGraph } from '../../core/graph-validator.js';
import { initializeState, transitionNode, getChangeStatus } from '../../core/state-machine.js';
import { getReadyNodes } from '../../core/graph-walker.js';
import { writeSnapshot } from '../../core/snapshot-generator.js';
import { getL0All } from '../../core/context-assembler.js';

// ── IO ───────────────────────────────────────────────────────────────────────
import { readYaml, writeYaml, writeMarkdown, ensureDir, exists } from '../../io/filesystem.js';

// ── utils ────────────────────────────────────────────────────────────────────
import {
  graphPath,
  statePath,
  nodeDir,
  snapshotPath,
} from '../../utils/paths.js';

// ── CLI functions (tested indirectly via their core deps) ────────────────────
import type { Graph } from '../../types/graph.js';
import type { WorkflowState } from '../../types/state.js';

// ── init helper (mirrors foreman init logic) ─────────────────────────────────

function initForeman(root: string): void {
  const dirs = [
    '.foreman/env',
    '.foreman/graph',
    '.foreman/nodes',
    '.foreman/specs',
    '.foreman/changes/archive',
    '.foreman/templates',
  ];
  for (const dir of dirs) {
    ensureDir(path.join(root, dir));
  }

  const config = {
    models: { default: 'sonnet', test_writer: 'opus', summarizer: 'haiku', verifier: 'haiku' },
    execution: { max_retries: 2, expand_limit: 1, parallel_mode: 'parallel', snapshot_refresh: 'after_each_node' },
    context: { ancestors: 'L0', parents: 'L1' },
    spec: { schema: 'spec-driven', specs_dir: '.foreman/specs', changes_dir: '.foreman/changes', archive_dir: '.foreman/changes/archive', templates_dir: '.foreman/templates' },
    graph: { graphs_dir: '.foreman/graph', nodes_dir: '.foreman/nodes' },
    environments: { env_dir: '.foreman/env', active: 'development' },
  };
  writeYaml(path.join(root, '.foreman', 'config.yaml'), config);

  const templates: Record<string, string> = {
    'proposal.md': '# Proposal\n\n## Problem\n\n## Solution\n',
    'design.md': '# Design\n\n## Architecture\n',
    'tasks.md': '## 1. Default\n\n- [ ] 1.1 Placeholder task\n',
  };
  for (const [file, content] of Object.entries(templates)) {
    writeMarkdown(path.join(root, '.foreman', 'templates', file), content);
  }
}

// ── new-change helper (mirrors foreman new logic) ────────────────────────────

function newChange(root: string, change: string): void {
  const changeDir = path.join(root, '.foreman', 'changes', change);
  ensureDir(changeDir);
  ensureDir(path.join(changeDir, 'specs'));

  // Copy templates
  const templatesDir = path.join(root, '.foreman', 'templates');
  for (const file of ['proposal.md', 'design.md', 'tasks.md']) {
    const src = path.join(templatesDir, file);
    if (exists(src)) {
      writeMarkdown(path.join(changeDir, file), fs.readFileSync(src, 'utf8'));
    }
  }

  writeYaml(path.join(changeDir, '.foreman.yaml'), {
    schema: 'foreman-change/v1',
    change,
    created_at: new Date().toISOString(),
    status: 'draft',
  });
}

// ── test setup ──────────────────────────────────────────────────────────────

let root: string;
const CHANGE = 'test-feature';

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'foreman-e2e-'));
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

// ── tests ───────────────────────────────────────────────────────────────────

describe('E2E: full workflow lifecycle', () => {

  // ── Step 1: init ────────────────────────────────────────────────────────────

  it('step 1 — foreman init creates .foreman/ structure', () => {
    initForeman(root);

    expect(fs.existsSync(path.join(root, '.foreman'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.foreman', 'config.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.foreman', 'env'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.foreman', 'graph'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.foreman', 'nodes'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.foreman', 'specs'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.foreman', 'changes', 'archive'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.foreman', 'templates'))).toBe(true);
  });

  // ── Step 2: new change ─────────────────────────────────────────────────────

  it('step 2 — foreman new creates change directory with templates', () => {
    newChange(root, CHANGE);

    const changeDir = path.join(root, '.foreman', 'changes', CHANGE);
    expect(fs.existsSync(changeDir)).toBe(true);
    expect(fs.existsSync(path.join(changeDir, '.foreman.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(changeDir, 'proposal.md'))).toBe(true);
    expect(fs.existsSync(path.join(changeDir, 'design.md'))).toBe(true);
    expect(fs.existsSync(path.join(changeDir, 'tasks.md'))).toBe(true);

    const meta = readYaml<{ change: string; status: string }>(
      path.join(changeDir, '.foreman.yaml')
    );
    expect(meta.change).toBe(CHANGE);
    expect(meta.status).toBe('draft');
  });

  // ── Step 3: write tasks.md ─────────────────────────────────────────────────

  it('step 3 — write tasks.md with 2 tasks', () => {
    const changeDir = path.join(root, '.foreman', 'changes', CHANGE);
    const tasks = `## 1. Core\n\n- [ ] 1.1 Add feature flag\n- [ ] 1.2 Wire up handler\n`;
    writeMarkdown(path.join(changeDir, 'tasks.md'), tasks);

    const written = fs.readFileSync(path.join(changeDir, 'tasks.md'), 'utf8');
    expect(written).toContain('Add feature flag');
    expect(written).toContain('Wire up handler');
  });

  // ── Step 4: graph generate ─────────────────────────────────────────────────

  it('step 4 — foreman graph generate creates graph.yaml and state.yaml', () => {
    const graph = generateGraph(root, CHANGE);
    writeYaml(graphPath(root, CHANGE), graph);
    writeYaml(statePath(root, CHANGE), initializeState(graph));
    ensureDir(path.join(root, '.foreman', 'nodes', CHANGE));

    expect(fs.existsSync(graphPath(root, CHANGE))).toBe(true);
    expect(fs.existsSync(statePath(root, CHANGE))).toBe(true);

    const saved = readYaml<Graph>(graphPath(root, CHANGE));
    expect(saved.change).toBe(CHANGE);
    expect(saved.nodes.length).toBeGreaterThanOrEqual(3); // snapshot + tasks + integration
    expect(saved.nodes[0].id).toBe('snapshot');
  });

  // ── Step 5: graph validate ─────────────────────────────────────────────────

  it('step 5 — foreman graph validate passes', () => {
    const graph = readYaml<Graph>(graphPath(root, CHANGE));
    const result = validateGraph(graph);

    expect(result.errors).toHaveLength(0);
  });

  // ── Step 6: graph show (structural check) ─────────────────────────────────

  it('step 6 — graph has correct node structure', () => {
    const graph = readYaml<Graph>(graphPath(root, CHANGE));

    const ids = graph.nodes.map(n => n.id);
    expect(ids).toContain('snapshot');
    expect(ids).toContain('write-tests');
    expect(ids).toContain('integration');

    // snapshot has no deps
    const snapshot = graph.nodes.find(n => n.id === 'snapshot')!;
    expect(snapshot.deps).toHaveLength(0);
    expect(snapshot.type).toBe('deterministic');

    // write-tests depends on snapshot
    const writeTests = graph.nodes.find(n => n.id === 'write-tests')!;
    expect(writeTests.deps).toContain('snapshot');
  });

  // ── Step 7: run — first ready node ────────────────────────────────────────

  it('step 7 — foreman run returns first ready node (snapshot)', () => {
    const graph = readYaml<Graph>(graphPath(root, CHANGE));
    const state = readYaml<WorkflowState>(statePath(root, CHANGE));

    const ready = getReadyNodes(graph, state);
    expect(ready.length).toBeGreaterThan(0);
    expect(ready[0].id).toBe('snapshot');
  });

  // ── Step 8: node start ─────────────────────────────────────────────────────

  it('step 8 — foreman node start transitions snapshot to in_progress', () => {
    let state = readYaml<WorkflowState>(statePath(root, CHANGE));
    state = transitionNode(state, 'snapshot', 'in_progress');
    writeYaml(statePath(root, CHANGE), state);

    const saved = readYaml<WorkflowState>(statePath(root, CHANGE));
    expect(saved.nodes['snapshot']?.status).toBe('in_progress');
    expect(saved.nodes['snapshot']?.started_at).toBeTruthy();
  });

  // ── Step 9: node complete ──────────────────────────────────────────────────

  it('step 9 — foreman node complete transitions snapshot to complete', () => {
    let state = readYaml<WorkflowState>(statePath(root, CHANGE));
    state = transitionNode(state, 'snapshot', 'complete', { l0: 'snapshot done, 42 files' });
    writeYaml(statePath(root, CHANGE), state);

    // Write L0 artifact
    const nDir = nodeDir(root, CHANGE, 'snapshot');
    ensureDir(nDir);
    writeMarkdown(path.join(nDir, 'L0.md'), '- snapshot: snapshot done, 42 files\n');

    const saved = readYaml<WorkflowState>(statePath(root, CHANGE));
    expect(saved.nodes['snapshot']?.status).toBe('complete');
    expect(saved.nodes['snapshot']?.l0).toBe('snapshot done, 42 files');
    expect(saved.nodes['snapshot']?.completed_at).toBeTruthy();
  });

  // ── Step 10: status — 1 node complete ─────────────────────────────────────

  it('step 10 — status shows 1 complete node', () => {
    const graph = readYaml<Graph>(graphPath(root, CHANGE));
    const state = readYaml<WorkflowState>(statePath(root, CHANGE));

    const complete = graph.nodes.filter(n => state.nodes[n.id]?.status === 'complete');
    expect(complete).toHaveLength(1);
    expect(complete[0].id).toBe('snapshot');
  });

  // ── Step 11: run — next ready node ────────────────────────────────────────

  it('step 11 — foreman run returns next ready node (write-tests) after snapshot done', () => {
    const graph = readYaml<Graph>(graphPath(root, CHANGE));
    const state = readYaml<WorkflowState>(statePath(root, CHANGE));

    const ready = getReadyNodes(graph, state);
    expect(ready.length).toBeGreaterThan(0);
    expect(ready[0].id).toBe('write-tests');
  });

  // ── Step 12: snapshot ──────────────────────────────────────────────────────

  it('step 12 — foreman snapshot creates snapshot.md', () => {
    // Create a minimal src/ directory for the scanner
    const srcDir = path.join(root, 'src');
    ensureDir(srcDir);
    fs.writeFileSync(path.join(srcDir, 'index.ts'), 'export const hello = "world";\n', 'utf8');

    writeSnapshot(root);

    const snapFile = snapshotPath(root);
    expect(fs.existsSync(snapFile)).toBe(true);
    const content = fs.readFileSync(snapFile, 'utf8');
    expect(content.length).toBeGreaterThan(0);
  });

  // ── Step 13: context l0 ────────────────────────────────────────────────────

  it('step 13 — foreman context l0 returns L0 entries for completed nodes', () => {
    const entries = getL0All(root, CHANGE);

    // snapshot node has an L0 headline
    expect(Array.isArray(entries)).toBe(true);
    const snapshotEntry = entries.find(e => e.nodeId === 'snapshot');
    expect(snapshotEntry).toBeDefined();
    expect(snapshotEntry?.headline).toBeTruthy();
  });

  // ── Bonus: change status computes correctly ────────────────────────────────

  it('bonus — getChangeStatus returns active while nodes are still pending', () => {
    const state = readYaml<WorkflowState>(statePath(root, CHANGE));
    const status = getChangeStatus(state);
    expect(status).toBe('active');
  });
});
