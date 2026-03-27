/**
 * Tests for archiveChange() — moves completed change artifacts to archive/.
 *
 * Tests are written RED-first: archiveChange() doesn't exist yet.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { writeYaml, readYaml, writeMarkdown, ensureDir } from '../../io/filesystem.js';
import { generateGraph } from '../../core/graph-generator.js';
import { initializeState, transitionNode } from '../../core/state-machine.js';
import { archiveChange, checkCompletion } from '../../core/archive.js';
import type { ArchiveResult } from '../../core/archive.js';
import {
  graphPath,
  statePath,
  nodeDir,
  changeDir,
} from '../../utils/paths.js';
import type { Graph } from '../../types/graph.js';
import type { WorkflowState } from '../../types/state.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function initSpecwork(root: string): void {
  const dirs = [
    '.specwork/env',
    '.specwork/graph',
    '.specwork/nodes',
    '.specwork/specs',
    '.specwork/changes/archive',
    '.specwork/templates',
  ];
  for (const dir of dirs) {
    ensureDir(path.join(root, dir));
  }
  writeYaml(path.join(root, '.specwork', 'config.yaml'), {
    models: { default: 'sonnet' },
    execution: { max_retries: 2, verify: 'gates' },
    spec: { archive_dir: '.specwork/changes/archive' },
    graph: { graphs_dir: '.specwork/graph', nodes_dir: '.specwork/nodes' },
  });
  writeMarkdown(path.join(root, '.specwork', 'templates', 'tasks.md'), '## 1. Default\n\n- [ ] 1.1 Placeholder\n');
  writeMarkdown(path.join(root, '.specwork', 'templates', 'proposal.md'), '# Proposal\n');
  writeMarkdown(path.join(root, '.specwork', 'templates', 'design.md'), '# Design\n');
}

function createChange(root: string, change: string): void {
  const cd = changeDir(root, change);
  ensureDir(cd);
  ensureDir(path.join(cd, 'specs'));
  writeYaml(path.join(cd, '.specwork.yaml'), { schema: 'specwork-change/v1', change, status: 'active' });
  writeMarkdown(path.join(cd, 'proposal.md'), '# Proposal\n\nTest proposal');
  writeMarkdown(path.join(cd, 'design.md'), '# Design\n\nTest design');
  writeMarkdown(path.join(cd, 'tasks.md'), '## 1. Core\n\n- [x] 1.1 Do something\n');
}

function generateAndCompleteAll(root: string, change: string): void {
  const graph = generateGraph(root, change);
  writeYaml(graphPath(root, change), graph);
  let state = initializeState(graph);

  // Complete every node
  for (const node of graph.nodes) {
    state = transitionNode(state, node.id, 'in_progress');
    state = transitionNode(state, node.id, 'complete', { l0: `${node.id} done` });

    // Write L0 artifact
    const nd = nodeDir(root, change, node.id);
    ensureDir(nd);
    writeMarkdown(path.join(nd, 'L0.md'), `- ${node.id}: ${node.id} done\n`);
  }

  state = { ...state, status: 'complete', updated_at: new Date().toISOString() };
  writeYaml(statePath(root, change), state);
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('archiveChange', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-archive-'));
    initSpecwork(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('moves change directory to archive', () => {
    createChange(root, 'my-feature');
    generateAndCompleteAll(root, 'my-feature');

    archiveChange(root, 'my-feature');

    const archivePath = path.join(root, '.specwork', 'changes', 'archive', 'my-feature');
    expect(fs.existsSync(archivePath)).toBe(true);
    expect(fs.existsSync(path.join(archivePath, 'proposal.md'))).toBe(true);
    expect(fs.existsSync(path.join(archivePath, 'design.md'))).toBe(true);
    expect(fs.existsSync(path.join(archivePath, 'tasks.md'))).toBe(true);
  });

  it('removes original change directory after archive', () => {
    createChange(root, 'my-feature');
    generateAndCompleteAll(root, 'my-feature');

    archiveChange(root, 'my-feature');

    const original = changeDir(root, 'my-feature');
    expect(fs.existsSync(original)).toBe(false);
  });

  it('generates summary.md with node timeline and L0 headlines', () => {
    createChange(root, 'my-feature');
    generateAndCompleteAll(root, 'my-feature');

    archiveChange(root, 'my-feature');

    const archivePath = path.join(root, '.specwork', 'changes', 'archive', 'my-feature');
    const summaryPath = path.join(archivePath, 'summary.md');
    expect(fs.existsSync(summaryPath)).toBe(true);

    const content = fs.readFileSync(summaryPath, 'utf-8');
    // Should contain node timeline with L0 headlines
    expect(content).toContain('## Node Timeline');
    expect(content).toContain('snapshot');
    expect(content).toContain('write-tests');
    expect(content).toContain('snapshot done');
  });

  it('does not create separate graph.yaml, state.yaml, or nodes/ in archive', () => {
    createChange(root, 'my-feature');
    generateAndCompleteAll(root, 'my-feature');

    archiveChange(root, 'my-feature');

    const archivePath = path.join(root, '.specwork', 'changes', 'archive', 'my-feature');
    expect(fs.existsSync(path.join(archivePath, 'graph.yaml'))).toBe(false);
    expect(fs.existsSync(path.join(archivePath, 'state.yaml'))).toBe(false);
    expect(fs.existsSync(path.join(archivePath, 'nodes'))).toBe(false);
  });

  it('includes verification verdict in summary when state has last_verdict', () => {
    createChange(root, 'my-feature');
    generateAndCompleteAll(root, 'my-feature');

    // Add last_verdict to state for snapshot node
    const sp = statePath(root, 'my-feature');
    const state = readYaml<WorkflowState>(sp);
    state.nodes['snapshot'] = { ...state.nodes['snapshot'], last_verdict: 'PASS' } as any;
    writeYaml(sp, state);

    archiveChange(root, 'my-feature');

    const archivePath = path.join(root, '.specwork', 'changes', 'archive', 'my-feature');
    const content = fs.readFileSync(path.join(archivePath, 'summary.md'), 'utf-8');
    expect(content).toContain('PASS');
    expect(content).toContain('## Verification Summary');
  });

  it('removes original graph and nodes directories after archive', () => {
    createChange(root, 'my-feature');
    generateAndCompleteAll(root, 'my-feature');

    archiveChange(root, 'my-feature');

    expect(fs.existsSync(path.join(root, '.specwork', 'graph', 'my-feature'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.specwork', 'nodes', 'my-feature'))).toBe(false);
  });

  it('updates .specwork.yaml status to archived', () => {
    createChange(root, 'my-feature');
    generateAndCompleteAll(root, 'my-feature');

    archiveChange(root, 'my-feature');

    const archivePath = path.join(root, '.specwork', 'changes', 'archive', 'my-feature');
    const meta = readYaml<{ status: string }>(path.join(archivePath, '.specwork.yaml'));
    expect(meta.status).toBe('archived');
  });

  it('throws if change directory does not exist', () => {
    expect(() => archiveChange(root, 'nonexistent')).toThrow();
  });

  it('throws if tasks.md has unchecked tasks and no state.yaml', () => {
    createChange(root, 'my-feature');
    // Overwrite tasks with unchecked items — no graph/state generated
    writeMarkdown(path.join(changeDir(root, 'my-feature'), 'tasks.md'), '## 1. Core\n\n- [ ] 1.1 Not done yet\n');

    expect(() => archiveChange(root, 'my-feature')).toThrow(/blocking/);
  });

  it('preserves specs subdirectory in archive', () => {
    createChange(root, 'my-feature');
    writeMarkdown(path.join(changeDir(root, 'my-feature'), 'specs', 'auth.md'), '# Auth Spec\n');
    generateAndCompleteAll(root, 'my-feature');

    archiveChange(root, 'my-feature');

    const archivePath = path.join(root, '.specwork', 'changes', 'archive', 'my-feature');
    expect(fs.existsSync(path.join(archivePath, 'specs', 'auth.md'))).toBe(true);
  });

  // ── spec promotion tests ──────────────────────────────────────────────────

  it('promotes specs to .specwork/specs/ during archive', () => {
    createChange(root, 'my-feature');
    writeMarkdown(path.join(changeDir(root, 'my-feature'), 'specs', 'auth.md'), '# Auth Spec\n\nUsers SHALL authenticate via JWT.');
    writeMarkdown(path.join(changeDir(root, 'my-feature'), 'specs', 'rate-limit.md'), '# Rate Limit Spec\n\nAPI SHOULD rate limit at 100 req/min.');
    generateAndCompleteAll(root, 'my-feature');

    archiveChange(root, 'my-feature');

    // Specs should now exist in .specwork/specs/
    expect(fs.existsSync(path.join(root, '.specwork', 'specs', 'auth.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.specwork', 'specs', 'rate-limit.md'))).toBe(true);

    // Content should match
    const content = fs.readFileSync(path.join(root, '.specwork', 'specs', 'auth.md'), 'utf-8');
    expect(content).toContain('Users SHALL authenticate via JWT');
  });

  it('overwrites existing specs on conflict during promotion', () => {
    // Pre-populate .specwork/specs/ with an old version
    writeMarkdown(path.join(root, '.specwork', 'specs', 'auth.md'), '# Old Auth Spec\n\nOld content.');

    createChange(root, 'my-feature');
    writeMarkdown(path.join(changeDir(root, 'my-feature'), 'specs', 'auth.md'), '# Updated Auth Spec\n\nNew content.');
    generateAndCompleteAll(root, 'my-feature');

    archiveChange(root, 'my-feature');

    const content = fs.readFileSync(path.join(root, '.specwork', 'specs', 'auth.md'), 'utf-8');
    expect(content).toContain('New content');
    expect(content).not.toContain('Old content');
  });

  it('skips spec promotion when change has no specs', () => {
    createChange(root, 'my-feature');
    // Don't add any spec files — specs/ dir exists but is empty
    generateAndCompleteAll(root, 'my-feature');

    // Should not throw
    archiveChange(root, 'my-feature');

    // .specwork/specs/ should still only have .gitkeep
    const specs = fs.readdirSync(path.join(root, '.specwork', 'specs'));
    expect(specs.filter(f => f !== '.gitkeep')).toHaveLength(0);
  });
});

// ── NEW: checkCompletion tests ──────────────────────────────────────────────

describe('checkCompletion', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-archive-'));
    initSpecwork(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('returns ok:true when all nodes in state.yaml are complete', () => {
    createChange(root, 'my-feature');
    generateAndCompleteAll(root, 'my-feature');

    const result = checkCompletion(root, 'my-feature');
    expect(result.ok).toBe(true);
    expect(result.blocking).toEqual([]);
  });

  it('returns ok:false with blocking node names when pending nodes exist', () => {
    createChange(root, 'my-feature');
    const graph = generateGraph(root, 'my-feature');
    writeYaml(graphPath(root, 'my-feature'), graph);
    let state = initializeState(graph);

    // Leave first node pending, complete the rest
    const [first, ...rest] = graph.nodes;
    for (const node of rest) {
      state = transitionNode(state, node.id, 'in_progress');
      state = transitionNode(state, node.id, 'complete', { l0: `${node.id} done` });
    }
    writeYaml(statePath(root, 'my-feature'), state);

    const result = checkCompletion(root, 'my-feature');
    expect(result.ok).toBe(false);
    expect(result.blocking).toContain(first.id);
  });

  it('returns ok:false with blocking node names when failed nodes exist', () => {
    createChange(root, 'my-feature');
    const graph = generateGraph(root, 'my-feature');
    writeYaml(graphPath(root, 'my-feature'), graph);
    let state = initializeState(graph);

    // Mark first node as failed
    const [first, ...rest] = graph.nodes;
    state = transitionNode(state, first.id, 'in_progress');
    state = transitionNode(state, first.id, 'failed');
    for (const node of rest) {
      state = transitionNode(state, node.id, 'in_progress');
      state = transitionNode(state, node.id, 'complete', { l0: `${node.id} done` });
    }
    writeYaml(statePath(root, 'my-feature'), state);

    const result = checkCompletion(root, 'my-feature');
    expect(result.ok).toBe(false);
    expect(result.blocking).toContain(first.id);
  });

  it('falls back to tasks.md when no state.yaml — passes if all checked', () => {
    createChange(root, 'my-feature');
    // tasks.md already has all items checked via createChange helper
    // Do NOT generate graph or state.yaml

    const result = checkCompletion(root, 'my-feature');
    expect(result.ok).toBe(true);
    expect(result.blocking).toEqual([]);
  });

  it('falls back to tasks.md when no state.yaml — blocks if unchecked', () => {
    createChange(root, 'my-feature');
    writeMarkdown(
      path.join(changeDir(root, 'my-feature'), 'tasks.md'),
      '## 1. Core\n\n- [ ] 1.1 Not done yet\n- [x] 1.2 Done\n'
    );
    // No state.yaml generated

    const result = checkCompletion(root, 'my-feature');
    expect(result.ok).toBe(false);
    expect(result.blocking.length).toBeGreaterThan(0);
  });
});

// ── NEW: summary.md tests (replaces digest.md) ─────────────────────────────

describe('archiveChange — summary.md', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-archive-'));
    initSpecwork(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('creates summary.md (not digest.md) in archive', () => {
    createChange(root, 'my-feature');
    generateAndCompleteAll(root, 'my-feature');

    archiveChange(root, 'my-feature');

    const archivePath = path.join(root, '.specwork', 'changes', 'archive', 'my-feature');
    expect(fs.existsSync(path.join(archivePath, 'summary.md'))).toBe(true);
    expect(fs.existsSync(path.join(archivePath, 'digest.md'))).toBe(false);
  });

  it('summary.md contains node timeline section', () => {
    createChange(root, 'my-feature');
    generateAndCompleteAll(root, 'my-feature');

    archiveChange(root, 'my-feature');

    const archivePath = path.join(root, '.specwork', 'changes', 'archive', 'my-feature');
    const content = fs.readFileSync(path.join(archivePath, 'summary.md'), 'utf-8');
    expect(content).toContain('## Node Timeline');
    expect(content).toContain('snapshot');
  });

  it('summary.md contains verification summary table when verdicts exist', () => {
    createChange(root, 'my-feature');
    generateAndCompleteAll(root, 'my-feature');

    // Add verdict to state
    const sp = statePath(root, 'my-feature');
    const state = readYaml<WorkflowState>(sp);
    state.nodes['snapshot'] = { ...state.nodes['snapshot'], last_verdict: 'PASS' } as any;
    writeYaml(sp, state);

    archiveChange(root, 'my-feature');

    const archivePath = path.join(root, '.specwork', 'changes', 'archive', 'my-feature');
    const content = fs.readFileSync(path.join(archivePath, 'summary.md'), 'utf-8');
    expect(content).toContain('## Verification Summary');
    expect(content).toContain('PASS');
  });
});

// ── NEW: ArchiveResult return type tests ────────────────────────────────────

describe('archiveChange — ArchiveResult', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-archive-'));
    initSpecwork(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('returns ArchiveResult with correct fields', () => {
    createChange(root, 'my-feature');
    writeMarkdown(path.join(changeDir(root, 'my-feature'), 'specs', 'auth.md'), '# Auth Spec\n');
    generateAndCompleteAll(root, 'my-feature');

    const result: ArchiveResult = archiveChange(root, 'my-feature');

    expect(result).toBeDefined();
    expect(result.change).toBe('my-feature');
    expect(result.archivePath).toContain('archive/my-feature');
    expect(Array.isArray(result.specsPromoted)).toBe(true);
    expect(result.specsPromoted).toContain('auth.md');
    expect(typeof result.nodesCleaned).toBe('boolean');
    expect(result.nodesCleaned).toBe(true);
    expect(typeof result.forced).toBe('boolean');
    expect(result.forced).toBe(false);
  });

  it('sets archived_at in .specwork.yaml', () => {
    createChange(root, 'my-feature');
    generateAndCompleteAll(root, 'my-feature');

    archiveChange(root, 'my-feature');

    const archivePath = path.join(root, '.specwork', 'changes', 'archive', 'my-feature');
    const meta = readYaml<{ status: string; archived_at?: string }>(
      path.join(archivePath, '.specwork.yaml')
    );
    expect(meta.archived_at).toBeDefined();
    // Should be a valid ISO date string
    expect(new Date(meta.archived_at!).toISOString()).toBe(meta.archived_at);
  });
});

// ── NEW: force mode test ────────────────────────────────────────────────────

describe('archiveChange — force mode', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-archive-'));
    initSpecwork(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('archiveChange with force:true bypasses failed-node guard', () => {
    createChange(root, 'my-feature');
    const graph = generateGraph(root, 'my-feature');
    writeYaml(graphPath(root, 'my-feature'), graph);
    let state = initializeState(graph);

    // Mark first node as failed
    const [first, ...rest] = graph.nodes;
    state = transitionNode(state, first.id, 'in_progress');
    state = transitionNode(state, first.id, 'failed');
    for (const node of rest) {
      state = transitionNode(state, node.id, 'in_progress');
      state = transitionNode(state, node.id, 'complete', { l0: `${node.id} done` });
      const nd = nodeDir(root, 'my-feature', node.id);
      ensureDir(nd);
      writeMarkdown(path.join(nd, 'L0.md'), `- ${node.id}: done\n`);
    }
    writeYaml(statePath(root, 'my-feature'), state);

    // Without force, should throw
    expect(() => archiveChange(root, 'my-feature')).toThrow();

    // Re-create change (was not archived due to throw)
    // With force, should succeed
    const result = archiveChange(root, 'my-feature', { force: true });
    expect(result).toBeDefined();
    expect(result.forced).toBe(true);
  });
});
