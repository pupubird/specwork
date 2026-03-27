/**
 * Integration tests for `specwork archive` CLI command.
 *
 * Tests are RED-first: the archive CLI subcommand does not exist yet.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { createTestProject, runSpecwork, cleanup, writeTasksFile } from './helpers.js';

// ── Minimal tasks.md that produces a valid graph ────────────────────────────
const SIMPLE_TASKS = `## 1. Setup

- [ ] 1.1 Initialize the module

## 2. Implementation

- [ ] 2.1 Write the core logic
`;

// ── Helper: init project, create change, generate graph ─────────────────────

function setupProjectWithGraph(dir: string, change = 'my-change'): void {
  runSpecwork(dir, 'init');
  runSpecwork(dir, `new ${change}`);
  writeTasksFile(dir, change, SIMPLE_TASKS);
  runSpecwork(dir, `graph generate ${change}`);
}

// ── Helper: mark all nodes complete in state.yaml ───────────────────────────

function markAllNodesComplete(dir: string, change: string): void {
  const statePath = path.join(dir, '.specwork', 'graph', change, 'state.yaml');
  const raw = fs.readFileSync(statePath, 'utf-8');
  const state = parseYaml(raw) as Record<string, unknown>;

  const nodes = state.nodes as Record<string, Record<string, unknown>>;
  const ts = new Date().toISOString();
  for (const nodeId of Object.keys(nodes)) {
    nodes[nodeId] = { ...nodes[nodeId], status: 'complete', completed_at: ts };

    // Write L0 artifacts so digest.md can be generated
    const nodeDir = path.join(dir, '.specwork', 'nodes', change, nodeId);
    fs.mkdirSync(nodeDir, { recursive: true });
    fs.writeFileSync(path.join(nodeDir, 'L0.md'), `- ${nodeId}: done\n`, 'utf-8');
  }

  state.status = 'complete';
  state.updated_at = ts;
  fs.writeFileSync(statePath, stringifyYaml(state), 'utf-8');
}

// ── Helper: also check all tasks in tasks.md ────────────────────────────────

function checkAllTasks(dir: string, change: string): void {
  const tasksPath = path.join(dir, '.specwork', 'changes', change, 'tasks.md');
  const content = fs.readFileSync(tasksPath, 'utf-8');
  fs.writeFileSync(tasksPath, content.replace(/- \[ \]/g, '- [x]'), 'utf-8');
}

// ══════════════════════════════════════════════════════════════════════════════
// specwork archive
// ══════════════════════════════════════════════════════════════════════════════

describe('specwork archive', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
  });

  afterEach(() => {
    cleanup(dir);
  });

  it('succeeds on completed change (exit 0)', () => {
    setupProjectWithGraph(dir, 'my-change');
    checkAllTasks(dir, 'my-change');
    markAllNodesComplete(dir, 'my-change');

    const result = runSpecwork(dir, 'archive my-change');
    expect(result.exitCode).toBe(0);

    // Archive directory should exist
    const archivePath = path.join(dir, '.specwork', 'changes', 'archive', 'my-change');
    expect(fs.existsSync(archivePath)).toBe(true);
    expect(fs.existsSync(path.join(archivePath, 'digest.md'))).toBe(true);

    // Original should be removed
    expect(fs.existsSync(path.join(dir, '.specwork', 'changes', 'my-change'))).toBe(false);
  });

  it('blocks on incomplete change (exit 1, error names blocking nodes)', () => {
    setupProjectWithGraph(dir, 'my-change');
    checkAllTasks(dir, 'my-change');
    // Do NOT mark nodes complete — they remain pending

    const result = runSpecwork(dir, 'archive my-change');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/pending|blocking|incomplete/i);

    // Archive should NOT exist
    const archivePath = path.join(dir, '.specwork', 'changes', 'archive', 'my-change');
    expect(fs.existsSync(archivePath)).toBe(false);
  });

  it('--force archives incomplete change', () => {
    setupProjectWithGraph(dir, 'my-change');
    checkAllTasks(dir, 'my-change');
    // Leave nodes incomplete

    const result = runSpecwork(dir, 'archive my-change --force');
    expect(result.exitCode).toBe(0);

    const archivePath = path.join(dir, '.specwork', 'changes', 'archive', 'my-change');
    expect(fs.existsSync(archivePath)).toBe(true);
  });

  it('--json outputs structured ArchiveResult', () => {
    setupProjectWithGraph(dir, 'my-change');
    checkAllTasks(dir, 'my-change');
    markAllNodesComplete(dir, 'my-change');

    const result = runSpecwork(dir, 'archive my-change --json');
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout.trim());
    expect(json.change).toBe('my-change');
    expect(json.archive_path || json.archivePath).toBeDefined();
    expect(Array.isArray(json.specs_promoted || json.specsPromoted)).toBe(true);
    expect(typeof (json.nodes_cleaned ?? json.nodesCleaned)).toBe('boolean');
    expect(typeof (json.forced ?? json.forced)).toBe('boolean');
  });

  it('errors when archive destination already exists (exit 1)', () => {
    setupProjectWithGraph(dir, 'my-change');
    checkAllTasks(dir, 'my-change');
    markAllNodesComplete(dir, 'my-change');

    // Pre-create archive destination
    const archivePath = path.join(dir, '.specwork', 'changes', 'archive', 'my-change');
    fs.mkdirSync(archivePath, { recursive: true });

    const result = runSpecwork(dir, 'archive my-change');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/already.*archived|already.*exists/i);
  });

  it('promotes specs to .specwork/specs/', () => {
    setupProjectWithGraph(dir, 'my-change');
    checkAllTasks(dir, 'my-change');
    markAllNodesComplete(dir, 'my-change');

    // Add a spec file to the change
    const specsDir = path.join(dir, '.specwork', 'changes', 'my-change', 'specs');
    fs.mkdirSync(specsDir, { recursive: true });
    fs.writeFileSync(path.join(specsDir, 'my-feature.md'), '# My Feature Spec\n\nAPI SHALL return 200.', 'utf-8');

    const result = runSpecwork(dir, 'archive my-change');
    expect(result.exitCode).toBe(0);

    // Spec should be promoted
    const promotedSpec = path.join(dir, '.specwork', 'specs', 'my-feature.md');
    expect(fs.existsSync(promotedSpec)).toBe(true);
    const content = fs.readFileSync(promotedSpec, 'utf-8');
    expect(content).toContain('API SHALL return 200');
  });
});
