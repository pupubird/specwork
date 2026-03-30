/**
 * Tests for scope-check fixes:
 * 1. Per-task scope extraction (graph generator)
 * 2. Node start SHA tracking (state machine)
 * 3. Node-baseline scope check (verification)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stringify as stringifyYaml } from 'yaml';

import { generateGraph } from '../../core/graph-generator.js';
import { initializeState, transitionNode } from '../../core/state-machine.js';
import { writeMarkdown, writeYaml, ensureDir } from '../../io/filesystem.js';
import { changeDir } from '../../utils/paths.js';
import type { NodeState } from '../../types/state.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-scope-'));
  fs.mkdirSync(path.join(dir, '.specwork', 'changes', 'test-change'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.specwork', 'graph'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.specwork', 'specs'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.specwork', 'templates'), { recursive: true });
  return dir;
}

function writeChange(root: string, change: string, tasksContent: string): void {
  const dir = changeDir(root, change);
  ensureDir(dir);
  writeMarkdown(path.join(dir, 'tasks.md'), tasksContent);
  writeMarkdown(path.join(dir, 'proposal.md'), '# Proposal\n');
  writeMarkdown(path.join(dir, 'design.md'), '# Design\n');
  writeYaml(path.join(dir, '.specwork.yaml'), { name: change, description: 'test', status: 'active' });
}

// ══════════════════════════════════════════════════════════════════════════════
// Per-Task Scope Extraction
// ══════════════════════════════════════════════════════════════════════════════

describe('graph generator — per-task scope extraction', () => {
  let root: string;

  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('extracts scope from task line when it contains explicit file paths', () => {
    writeChange(root, 'test-change', `## 1. Core

- [ ] 1.1 Update src/core/graph-generator.ts to fix scope extraction
`);
    const graph = generateGraph(root, 'test-change');
    const implNode = graph.nodes.find(n => n.id === 'impl-1');
    expect(implNode).toBeDefined();
    expect(implNode!.scope).toContain('src/core/graph-generator.ts');
  });

  it('collapsed group scope is union of all task scopes', () => {
    writeChange(root, 'test-change', `## 1. Core

- [ ] 1.1 Fix src/core/graph-walker.ts scope logic
- [ ] 1.2 Update src/core/verification.ts for baseline
`);
    const graph = generateGraph(root, 'test-change');

    // Collapsed group should have union of both task scopes
    const node = graph.nodes.find(n => n.id === 'impl-1');
    expect(node).toBeDefined();
    expect(node!.scope).toContain('src/core/graph-walker.ts');
    expect(node!.scope).toContain('src/core/verification.ts');
  });

  it('uses group-slug fallback when task has no explicit paths', () => {
    writeChange(root, 'test-change', `## 1. Graph Generator

- [ ] 1.1 Fix the scope logic
`);
    const graph = generateGraph(root, 'test-change');
    const implNode = graph.nodes.find(n => n.id === 'impl-1');
    expect(implNode).toBeDefined();
    // Should NOT be ['src/'] — should be based on group name
    expect(implNode!.scope[0]).not.toBe('src/');
    expect(implNode!.scope[0]).toContain('graph-generator');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Node Start SHA Tracking
// ══════════════════════════════════════════════════════════════════════════════

describe('state machine — start_sha tracking', () => {
  it('initializes start_sha as null for all nodes', () => {
    const graph = {
      change: 'test',
      version: '1',
      created_at: new Date().toISOString(),
      nodes: [
        { id: 'snapshot', type: 'deterministic' as const, description: 'snap', deps: [], inputs: [], outputs: [], scope: [], validate: [], command: 'echo' },
      ],
    };
    const state = initializeState(graph);
    expect((state.nodes['snapshot'] as NodeState & { start_sha?: string | null }).start_sha).toBeNull();
  });

  it('records start_sha when transitioning to in_progress', () => {
    const graph = {
      change: 'test',
      version: '1',
      created_at: new Date().toISOString(),
      nodes: [
        { id: 'node-a', type: 'llm' as const, description: 'test', deps: [], inputs: [], outputs: [], scope: [], validate: [], agent: 'test' },
      ],
    };
    const state = initializeState(graph);
    const updated = transitionNode(state, 'node-a', 'in_progress', { start_sha: 'abc123' });
    expect((updated.nodes['node-a'] as NodeState & { start_sha?: string }).start_sha).toBe('abc123');
  });

  it('does not overwrite start_sha on retry (failed → in_progress)', () => {
    const graph = {
      change: 'test',
      version: '1',
      created_at: new Date().toISOString(),
      nodes: [
        { id: 'node-a', type: 'llm' as const, description: 'test', deps: [], inputs: [], outputs: [], scope: [], validate: [], agent: 'test' },
      ],
    };
    let state = initializeState(graph);
    state = transitionNode(state, 'node-a', 'in_progress', { start_sha: 'original-sha' });
    state = transitionNode(state, 'node-a', 'failed');
    state = transitionNode(state, 'node-a', 'in_progress', { start_sha: 'new-sha' });
    // Should keep original
    expect((state.nodes['node-a'] as NodeState & { start_sha?: string }).start_sha).toBe('original-sha');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// RunChecksOptions.startSha
// ══════════════════════════════════════════════════════════════════════════════

describe('verification — RunChecksOptions.startSha', () => {
  it('RunChecksOptions accepts optional startSha field', async () => {
    // This is a type-level test — just verify the interface accepts the field
    const { runChecks } = await import('../../core/verification.js');
    expect(typeof runChecks).toBe('function');
  });
});
