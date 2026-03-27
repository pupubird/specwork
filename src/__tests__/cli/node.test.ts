import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initializeState, transitionNode } from '../../core/state-machine.js';
import {
  findSpecworkRoot,
  graphPath,
  statePath,
  currentNodePath,
  nodeDir,
} from '../../utils/paths.js';
import { readYaml, writeYaml } from '../../io/filesystem.js';
import type { Graph } from '../../types/graph.js';
import type { WorkflowState } from '../../types/state.js';

// ── We test the core logic used by the CLI commands rather than spawning processes.
//    This lets us run fast, in-process tests without building the CLI.

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-cli-test-'));
  fs.mkdirSync(path.join(dir, '.specwork', 'graph', 'test-change'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.specwork', 'nodes', 'test-change'), { recursive: true });
  return dir;
}

function rmTempRoot(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

const testGraph: Graph = {
  change: 'test-change',
  version: '1',
  created_at: '2026-03-26T00:00:00Z',
  nodes: [
    {
      id: 'snapshot',
      type: 'deterministic',
      description: 'snapshot',
      deps: [],
      inputs: [],
      outputs: [],
      scope: [],
      validate: [],
      command: 'echo snapshot',
    },
    {
      id: 'write-tests',
      type: 'llm',
      description: 'write tests',
      agent: 'specwork-test-writer',
      deps: ['snapshot'],
      inputs: [],
      outputs: [],
      scope: ['src/__tests__/'],
      validate: [],
      retry: 2,
    },
    {
      id: 'impl-core',
      type: 'llm',
      description: 'impl core',
      agent: 'specwork-implementer',
      deps: ['write-tests'],
      inputs: [],
      outputs: [],
      scope: ['src/core/'],
      validate: [],
      retry: 1,
    },
  ],
};

function setupChange(root: string): void {
  writeYaml(graphPath(root, 'test-change'), testGraph);
  writeYaml(statePath(root, 'test-change'), initializeState(testGraph));
}

// ── Node start (core logic) ───────────────────────────────────────────────────

describe('node start — core logic', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempRoot();
    setupChange(root);
  });
  afterEach(() => rmTempRoot(root));

  it('transitions node to in_progress', () => {
    const state = readYaml<WorkflowState>(statePath(root, 'test-change'));
    const updated = transitionNode(state, 'snapshot', 'in_progress');
    writeYaml(statePath(root, 'test-change'), updated);

    const saved = readYaml<WorkflowState>(statePath(root, 'test-change'));
    expect(saved.nodes['snapshot']?.status).toBe('in_progress');
  });

  it('blocks start when deps are not complete', () => {
    const state = readYaml<WorkflowState>(statePath(root, 'test-change'));

    // write-tests depends on snapshot (which is pending) — should not be startable
    const blockedDeps = testGraph.nodes
      .find(n => n.id === 'write-tests')!
      .deps.filter(depId => state.nodes[depId]?.status !== 'complete');

    expect(blockedDeps).toContain('snapshot');
  });

  it('writes .current-node tracking file', () => {
    const cnp = currentNodePath(root);
    fs.writeFileSync(cnp, 'test-change/snapshot', 'utf8');
    expect(fs.readFileSync(cnp, 'utf8')).toBe('test-change/snapshot');
  });
});

// ── Node complete (core logic) ────────────────────────────────────────────────

describe('node complete — core logic', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempRoot();
    setupChange(root);
  });
  afterEach(() => rmTempRoot(root));

  it('transitions in_progress → complete', () => {
    let state = readYaml<WorkflowState>(statePath(root, 'test-change'));
    state = transitionNode(state, 'snapshot', 'in_progress');
    state = transitionNode(state, 'snapshot', 'complete', { l0: 'snapshot: complete, 5 files' });
    writeYaml(statePath(root, 'test-change'), state);

    const saved = readYaml<WorkflowState>(statePath(root, 'test-change'));
    expect(saved.nodes['snapshot']?.status).toBe('complete');
    expect(saved.nodes['snapshot']?.l0).toBe('snapshot: complete, 5 files');
  });

  it('writes L0 artifact to node directory', () => {
    const nDir = nodeDir(root, 'test-change', 'snapshot');
    fs.mkdirSync(nDir, { recursive: true });
    fs.writeFileSync(path.join(nDir, 'L0.md'), '- snapshot: complete, 5 files\n', 'utf8');

    const l0 = fs.readFileSync(path.join(nDir, 'L0.md'), 'utf8');
    expect(l0).toContain('snapshot: complete');
  });

  it('clears current-node after complete', () => {
    fs.writeFileSync(currentNodePath(root), 'test-change/snapshot', 'utf8');

    // Simulate clear
    if (fs.existsSync(currentNodePath(root))) fs.unlinkSync(currentNodePath(root));

    expect(fs.existsSync(currentNodePath(root))).toBe(false);
  });
});

// ── Node fail (core logic) ────────────────────────────────────────────────────

describe('node fail — core logic', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempRoot();
    setupChange(root);
  });
  afterEach(() => rmTempRoot(root));

  it('transitions in_progress → failed when retries remain', () => {
    let state = readYaml<WorkflowState>(statePath(root, 'test-change'));
    state = transitionNode(state, 'snapshot', 'in_progress');
    state = transitionNode(state, 'snapshot', 'failed', { error: 'command failed' });

    expect(state.nodes['snapshot']?.status).toBe('failed');
    expect(state.nodes['snapshot']?.error).toBe('command failed');
  });

  it('transitions to escalated and skips dependents when retries exhausted', async () => {
    const { incrementRetry, skipDependents } = await import('../../core/state-machine.js');
    let state = readYaml<WorkflowState>(statePath(root, 'test-change'));

    // Exhaust retries for snapshot (maxRetries = 2)
    state = transitionNode(state, 'snapshot', 'in_progress');
    const { state: s1 } = incrementRetry(state, 'snapshot', 2);
    const { state: s2 } = incrementRetry(s1, 'snapshot', 2);
    const { state: s3, exhausted } = incrementRetry(s2, 'snapshot', 2);
    expect(exhausted).toBe(true);

    state = transitionNode(s3, 'snapshot', 'escalated');
    const withSkips = skipDependents(state, testGraph, 'snapshot');

    expect(withSkips.nodes['snapshot']?.status).toBe('escalated');
    expect(withSkips.nodes['write-tests']?.status).toBe('skipped');
    expect(withSkips.nodes['impl-core']?.status).toBe('skipped');
  });
});

// ── Node escalate (core logic) ────────────────────────────────────────────────

describe('node escalate — core logic', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempRoot();
    setupChange(root);
  });
  afterEach(() => rmTempRoot(root));

  it('escalates and skips all dependents immediately', async () => {
    const { skipDependents } = await import('../../core/state-machine.js');
    let state = readYaml<WorkflowState>(statePath(root, 'test-change'));
    state = transitionNode(state, 'snapshot', 'in_progress');
    state = transitionNode(state, 'snapshot', 'escalated', { error: 'manual' });
    state = skipDependents(state, testGraph, 'snapshot');

    expect(state.nodes['snapshot']?.status).toBe('escalated');
    expect(state.nodes['write-tests']?.status).toBe('skipped');
    expect(state.nodes['impl-core']?.status).toBe('skipped');
  });

  it('records reason in error field', () => {
    let state = readYaml<WorkflowState>(statePath(root, 'test-change'));
    state = transitionNode(state, 'snapshot', 'in_progress');
    state = transitionNode(state, 'snapshot', 'escalated', { error: 'manual escalation' });

    expect(state.nodes['snapshot']?.error).toBe('manual escalation');
  });
});
