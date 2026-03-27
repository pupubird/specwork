/**
 * Enhanced archive digest tests for progressive-context change (Group 4.2).
 *
 * Tests that archiveChange uses buildDigest() and writes digest.md instead of summary.md.
 *
 * ALL tests MUST FAIL because archiveChange currently calls buildSummary()
 * and writes to summary.md — not digest.md.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readYaml, writeYaml, writeMarkdown, ensureDir } from '../../io/filesystem.js';
import { graphPath, statePath, nodeDir, changeDir, archiveChangeDir } from '../../utils/paths.js';
import { archiveChange } from '../../core/archive.js';
import { generateGraph } from '../../core/graph-generator.js';
import { initializeState, transitionNode } from '../../core/state-machine.js';
import type { Graph } from '../../types/graph.js';
import type { WorkflowState } from '../../types/state.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  });
}

function createChange(root: string, change: string): void {
  const cd = changeDir(root, change);
  ensureDir(cd);
  ensureDir(path.join(cd, 'specs'));
  writeYaml(path.join(cd, '.specwork.yaml'), {
    meta: { name: change, description: 'Test change', status: 'active' },
  });
  writeMarkdown(path.join(cd, 'proposal.md'), '# Proposal\n\nTest proposal');
  writeMarkdown(path.join(cd, 'design.md'), '# Design\n\nTest design');
  writeMarkdown(path.join(cd, 'tasks.md'), '## 1. Core\n\n- [x] 1.1 Do something\n');
}

function generateAndCompleteAll(root: string, change: string): void {
  const graph = generateGraph(root, change);
  writeYaml(graphPath(root, change), graph);
  let state = initializeState(graph);

  for (const node of graph.nodes) {
    state = transitionNode(state, node.id, 'in_progress');
    state = transitionNode(state, node.id, 'complete', { l0: `${node.id} done` });

    const nd = nodeDir(root, change, node.id);
    ensureDir(nd);
    writeMarkdown(path.join(nd, 'L0.md'), `- ${node.id}: ${node.id} done\n`);
  }

  state = { ...state, status: 'complete', updated_at: new Date().toISOString() };
  writeYaml(statePath(root, change), state);
}

// ── Tests: archiveChange writes digest.md ───────────────────────────────────

describe('archiveChange — digest.md (replaces summary.md)', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-digest-enh-'));
    initSpecwork(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('writes digest.md in archive directory', () => {
    createChange(root, 'my-feature');
    generateAndCompleteAll(root, 'my-feature');

    archiveChange(root, 'my-feature');

    const archiveDir = archiveChangeDir(root, 'my-feature');
    expect(fs.existsSync(path.join(archiveDir, 'digest.md'))).toBe(true);
  });

  it('does NOT write summary.md in archive directory', () => {
    createChange(root, 'my-feature');
    generateAndCompleteAll(root, 'my-feature');

    archiveChange(root, 'my-feature');

    const archiveDir = archiveChangeDir(root, 'my-feature');
    // After the change, archiveChange should write digest.md, not summary.md
    expect(fs.existsSync(path.join(archiveDir, 'summary.md'))).toBe(false);
  });

  it('digest.md contains Node Timeline section with L0 headlines', () => {
    createChange(root, 'my-feature');
    generateAndCompleteAll(root, 'my-feature');

    archiveChange(root, 'my-feature');

    const archiveDir = archiveChangeDir(root, 'my-feature');
    const digestPath = path.join(archiveDir, 'digest.md');

    // Will fail because digest.md doesn't exist (summary.md is written instead)
    expect(fs.existsSync(digestPath)).toBe(true);
    const content = fs.readFileSync(digestPath, 'utf-8');
    expect(content).toContain('## Node Timeline');
    expect(content).toContain('snapshot');
    expect(content).toContain('snapshot done');
  });

  it('digest.md contains Verification Summary table when verdicts exist', () => {
    createChange(root, 'my-feature');
    generateAndCompleteAll(root, 'my-feature');

    // Add verdict to state before archiving
    const sp = statePath(root, 'my-feature');
    const state = readYaml<WorkflowState>(sp);
    state.nodes['snapshot'] = { ...state.nodes['snapshot'], last_verdict: 'PASS' } as any;
    writeYaml(sp, state);

    archiveChange(root, 'my-feature');

    const archiveDir = archiveChangeDir(root, 'my-feature');
    const digestPath = path.join(archiveDir, 'digest.md');
    expect(fs.existsSync(digestPath)).toBe(true);
    const content = fs.readFileSync(digestPath, 'utf-8');
    expect(content).toContain('## Verification Summary');
    expect(content).toMatch(/\|\s*Node\s*\|.*Verdict/i);
    expect(content).toContain('PASS');
  });
});

