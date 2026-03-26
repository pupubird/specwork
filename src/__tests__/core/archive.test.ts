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
import { archiveChange } from '../../core/archive.js';
import {
  graphPath,
  statePath,
  nodeDir,
  changeDir,
} from '../../utils/paths.js';
import type { Graph } from '../../types/graph.js';
import type { WorkflowState } from '../../types/state.js';

// ── helpers ──────────────────────────────────────────────────────────────────

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
  writeYaml(path.join(root, '.foreman', 'config.yaml'), {
    models: { default: 'sonnet' },
    execution: { max_retries: 2, verify: 'gates' },
    spec: { archive_dir: '.foreman/changes/archive' },
    graph: { graphs_dir: '.foreman/graph', nodes_dir: '.foreman/nodes' },
  });
  writeMarkdown(path.join(root, '.foreman', 'templates', 'tasks.md'), '## 1. Default\n\n- [ ] 1.1 Placeholder\n');
  writeMarkdown(path.join(root, '.foreman', 'templates', 'proposal.md'), '# Proposal\n');
  writeMarkdown(path.join(root, '.foreman', 'templates', 'design.md'), '# Design\n');
}

function createChange(root: string, change: string): void {
  const cd = changeDir(root, change);
  ensureDir(cd);
  ensureDir(path.join(cd, 'specs'));
  writeYaml(path.join(cd, '.foreman.yaml'), { schema: 'foreman-change/v1', change, status: 'active' });
  writeMarkdown(path.join(cd, 'proposal.md'), '# Proposal\n\nTest proposal');
  writeMarkdown(path.join(cd, 'design.md'), '# Design\n\nTest design');
  writeMarkdown(path.join(cd, 'tasks.md'), '## 1. Core\n\n- [ ] 1.1 Do something\n');
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
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'foreman-archive-'));
    initForeman(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('moves change directory to archive', () => {
    createChange(root, 'my-feature');
    generateAndCompleteAll(root, 'my-feature');

    archiveChange(root, 'my-feature');

    const archivePath = path.join(root, '.foreman', 'changes', 'archive', 'my-feature');
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

  it('generates summary.md with graph, state, and node L0s consolidated', () => {
    createChange(root, 'my-feature');
    generateAndCompleteAll(root, 'my-feature');

    archiveChange(root, 'my-feature');

    const archivePath = path.join(root, '.foreman', 'changes', 'archive', 'my-feature');
    const summaryPath = path.join(archivePath, 'summary.md');
    expect(fs.existsSync(summaryPath)).toBe(true);

    const content = fs.readFileSync(summaryPath, 'utf-8');
    // Should contain graph info
    expect(content).toContain('## Graph');
    expect(content).toContain('snapshot');
    expect(content).toContain('write-tests');
    // Should contain state info
    expect(content).toContain('## State');
    expect(content).toContain('complete');
    // Should contain node summaries
    expect(content).toContain('## Nodes');
    expect(content).toContain('snapshot done');
  });

  it('does not create separate graph.yaml, state.yaml, or nodes/ in archive', () => {
    createChange(root, 'my-feature');
    generateAndCompleteAll(root, 'my-feature');

    archiveChange(root, 'my-feature');

    const archivePath = path.join(root, '.foreman', 'changes', 'archive', 'my-feature');
    expect(fs.existsSync(path.join(archivePath, 'graph.yaml'))).toBe(false);
    expect(fs.existsSync(path.join(archivePath, 'state.yaml'))).toBe(false);
    expect(fs.existsSync(path.join(archivePath, 'nodes'))).toBe(false);
  });

  it('includes verify.md content in summary when present', () => {
    createChange(root, 'my-feature');
    generateAndCompleteAll(root, 'my-feature');

    // Add a verify.md to one node
    const snapshotDir = nodeDir(root, 'my-feature', 'snapshot');
    writeMarkdown(path.join(snapshotDir, 'verify.md'), '## Verify\n\nPASS');

    archiveChange(root, 'my-feature');

    const archivePath = path.join(root, '.foreman', 'changes', 'archive', 'my-feature');
    const content = fs.readFileSync(path.join(archivePath, 'summary.md'), 'utf-8');
    expect(content).toContain('PASS');
  });

  it('removes original graph and nodes directories after archive', () => {
    createChange(root, 'my-feature');
    generateAndCompleteAll(root, 'my-feature');

    archiveChange(root, 'my-feature');

    expect(fs.existsSync(path.join(root, '.foreman', 'graph', 'my-feature'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.foreman', 'nodes', 'my-feature'))).toBe(false);
  });

  it('updates .foreman.yaml status to archived', () => {
    createChange(root, 'my-feature');
    generateAndCompleteAll(root, 'my-feature');

    archiveChange(root, 'my-feature');

    const archivePath = path.join(root, '.foreman', 'changes', 'archive', 'my-feature');
    const meta = readYaml<{ status: string }>(path.join(archivePath, '.foreman.yaml'));
    expect(meta.status).toBe('archived');
  });

  it('throws if change directory does not exist', () => {
    expect(() => archiveChange(root, 'nonexistent')).toThrow();
  });

  it('preserves specs subdirectory in archive', () => {
    createChange(root, 'my-feature');
    writeMarkdown(path.join(changeDir(root, 'my-feature'), 'specs', 'auth.md'), '# Auth Spec\n');
    generateAndCompleteAll(root, 'my-feature');

    archiveChange(root, 'my-feature');

    const archivePath = path.join(root, '.foreman', 'changes', 'archive', 'my-feature');
    expect(fs.existsSync(path.join(archivePath, 'specs', 'auth.md'))).toBe(true);
  });

  // ── spec promotion tests ──────────────────────────────────────────────────

  it('promotes specs to .foreman/specs/ during archive', () => {
    createChange(root, 'my-feature');
    writeMarkdown(path.join(changeDir(root, 'my-feature'), 'specs', 'auth.md'), '# Auth Spec\n\nUsers SHALL authenticate via JWT.');
    writeMarkdown(path.join(changeDir(root, 'my-feature'), 'specs', 'rate-limit.md'), '# Rate Limit Spec\n\nAPI SHOULD rate limit at 100 req/min.');
    generateAndCompleteAll(root, 'my-feature');

    archiveChange(root, 'my-feature');

    // Specs should now exist in .foreman/specs/
    expect(fs.existsSync(path.join(root, '.foreman', 'specs', 'auth.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.foreman', 'specs', 'rate-limit.md'))).toBe(true);

    // Content should match
    const content = fs.readFileSync(path.join(root, '.foreman', 'specs', 'auth.md'), 'utf-8');
    expect(content).toContain('Users SHALL authenticate via JWT');
  });

  it('overwrites existing specs on conflict during promotion', () => {
    // Pre-populate .foreman/specs/ with an old version
    writeMarkdown(path.join(root, '.foreman', 'specs', 'auth.md'), '# Old Auth Spec\n\nOld content.');

    createChange(root, 'my-feature');
    writeMarkdown(path.join(changeDir(root, 'my-feature'), 'specs', 'auth.md'), '# Updated Auth Spec\n\nNew content.');
    generateAndCompleteAll(root, 'my-feature');

    archiveChange(root, 'my-feature');

    const content = fs.readFileSync(path.join(root, '.foreman', 'specs', 'auth.md'), 'utf-8');
    expect(content).toContain('New content');
    expect(content).not.toContain('Old content');
  });

  it('skips spec promotion when change has no specs', () => {
    createChange(root, 'my-feature');
    // Don't add any spec files — specs/ dir exists but is empty
    generateAndCompleteAll(root, 'my-feature');

    // Should not throw
    archiveChange(root, 'my-feature');

    // .foreman/specs/ should still only have .gitkeep
    const specs = fs.readdirSync(path.join(root, '.foreman', 'specs'));
    expect(specs.filter(f => f !== '.gitkeep')).toHaveLength(0);
  });
});
