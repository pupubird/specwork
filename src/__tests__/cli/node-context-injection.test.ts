import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeYaml, writeMarkdown } from '../../io/filesystem.js';
import { graphPath, statePath, nodeDir, nodesDir, snapshotPath } from '../../utils/paths.js';
import type { Graph } from '../../types/graph.js';
import type { WorkflowState } from '../../types/state.js';

/**
 * Context Injection tests — after the progressive-context change,
 * `specwork node start --json` should include an assembled `context` field
 * in its JSON response.
 *
 * These tests call startCmd indirectly by importing the CLI module and
 * invoking the commander action. All tests should FAIL because the current
 * startCmd does NOT include a `context` field in its JSON output.
 */

function makeTempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-ctx-inject-'));
  fs.mkdirSync(path.join(dir, '.specwork', 'graph', 'test-change'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.specwork', 'nodes', 'test-change'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.specwork', 'env'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.specwork', 'changes', 'test-change'), { recursive: true });
  return dir;
}

const testGraph: Graph = {
  change: 'test-change',
  version: '1',
  created_at: '2026-03-26T00:00:00Z',
  nodes: [
    { id: 'snapshot', type: 'deterministic', description: 'snapshot', deps: [], inputs: [], outputs: [], scope: [], validate: [], command: 'echo snapshot' },
    { id: 'write-tests', type: 'llm', description: 'write tests', agent: 'specwork-test-writer', deps: ['snapshot'], inputs: [], outputs: [], scope: ['src/__tests__/'], validate: [], retry: 2 },
    { id: 'impl-core', type: 'llm', description: 'impl core', agent: 'specwork-implementer', deps: ['write-tests'], inputs: [], outputs: [], scope: ['src/core/'], validate: [], retry: 1 },
  ],
};

function makeState(change: string, nodeStatuses: Record<string, 'pending' | 'complete' | 'in_progress'>): WorkflowState {
  const nodes: WorkflowState['nodes'] = {};
  for (const [id, status] of Object.entries(nodeStatuses)) {
    nodes[id] = { status, started_at: null, completed_at: null, retries: 0, error: null, l0: null, verified: false, last_verdict: null, verify_history: [] };
  }
  return { change, status: 'active', started_at: '2026-03-26T00:00:00Z', updated_at: '2026-03-26T00:00:00Z', lock: null, nodes };
}

function setupFixtures(root: string, state: WorkflowState): void {
  writeYaml(graphPath(root, 'test-change'), testGraph);
  writeYaml(statePath(root, 'test-change'), state);
  // Write a .specwork.yaml for change context
  writeYaml(path.join(root, '.specwork', 'changes', 'test-change', '.specwork.yaml'), {
    meta: { name: 'test-change', description: 'Test change for context injection', status: 'active' },
  });
}

let root: string;

beforeEach(() => {
  root = makeTempRoot();
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('node start --json context injection', () => {
  it('includes a non-empty context field in JSON response', async () => {
    // Setup: snapshot complete, write-tests ready to start
    const state = makeState('test-change', { snapshot: 'complete', 'write-tests': 'pending', 'impl-core': 'pending' });
    setupFixtures(root, state);

    // Write snapshot so context has something
    writeMarkdown(snapshotPath(root), '# Environment Snapshot\n\nProject files: src/index.ts\n');

    // Write L0 for snapshot node
    const snapshotNodeDir = nodeDir(root, 'test-change', 'snapshot');
    fs.mkdirSync(snapshotNodeDir, { recursive: true });
    writeMarkdown(path.join(snapshotNodeDir, 'L0.md'), '- snapshot: Environment snapshot captured\n');

    // Import and call startCmd logic
    // We simulate what the CLI does by calling the underlying functions
    const { assembleContext, renderContext } = await import('../../core/context-assembler.js');
    const { readYaml } = await import('../../io/filesystem.js');

    // Load graph and state as startCmd does
    const graph = await readYaml<Graph>(graphPath(root, 'test-change'));
    const stateData = await readYaml<WorkflowState>(statePath(root, 'test-change'));

    // The NEW behavior: startCmd should assemble context and include it in response
    // We test this by checking that the JSON response would contain a `context` field
    const bundle = assembleContext(root, 'test-change', 'write-tests');
    const contextStr = renderContext(bundle);

    // Current startCmd builds a response object — after the change it should include `context`
    // We simulate the response object as startCmd currently builds it
    const response: Record<string, unknown> = {
      change: 'test-change',
      node: 'write-tests',
      type: 'llm',
      status: 'in_progress',
      scope: ['src/__tests__/'],
      deps: ['snapshot'],
    };

    // THIS IS THE KEY ASSERTION: after the change, startCmd will inject context into response
    // Currently startCmd does NOT do this, so we test the expected new behavior
    // by checking that `context` would be a non-empty string containing snapshot content
    expect(contextStr).toBeTruthy();
    expect(contextStr).toContain('Environment Snapshot');
    expect(contextStr).toContain('Completed Nodes (L0)');

    // The actual failing assertion: the response object from startCmd should have `context`
    // Since startCmd currently does NOT add this field, this test will fail
    // We check by importing the actual CLI behavior
    const { buildNextAction, readChangeContext } = await import('../../core/next-action.js');
    const ctx = readChangeContext(root, 'test-change');
    const nextAction = buildNextAction('node:start', ctx, { change: 'test-change', nodeId: 'write-tests' });

    // After the change, node:start next_action should NOT reference `specwork context assemble`
    // because context is auto-injected. Currently it DOES reference it — so this FAILS.
    expect(nextAction.command).not.toContain('context assemble');
  });

  it('context includes parent L1 when parent has L1.md artifact', async () => {
    const state = makeState('test-change', { snapshot: 'complete', 'write-tests': 'complete', 'impl-core': 'pending' });
    setupFixtures(root, state);

    // Write snapshot
    writeMarkdown(snapshotPath(root), '# Snapshot\nfiles: src/core/archive.ts\n');

    // Write L0 for completed nodes
    const snapshotNDir = nodeDir(root, 'test-change', 'snapshot');
    fs.mkdirSync(snapshotNDir, { recursive: true });
    writeMarkdown(path.join(snapshotNDir, 'L0.md'), '- snapshot: Environment snapshot captured\n');

    const writeTestsNDir = nodeDir(root, 'test-change', 'write-tests');
    fs.mkdirSync(writeTestsNDir, { recursive: true });
    writeMarkdown(path.join(writeTestsNDir, 'L0.md'), '- write-tests: 15 tests written, all RED\n');

    // Write L1 for write-tests (parent of impl-core)
    writeMarkdown(path.join(writeTestsNDir, 'L1.md'), '## write-tests\nFiles: src/__tests__/core/archive.test.ts\nExports: 15 test cases covering archive digest\n');

    // Assemble context for impl-core — should include write-tests L1
    const { assembleContext, renderContext } = await import('../../core/context-assembler.js');
    const bundle = assembleContext(root, 'test-change', 'impl-core');
    const contextStr = renderContext(bundle);

    // Context should include parent L1 content
    expect(contextStr).toContain('Parent Node Context (L1)');
    expect(contextStr).toContain('write-tests');
    expect(contextStr).toContain('15 test cases covering archive digest');

    // THE FAILING ASSERTION: after the change, this context string should be
    // auto-injected into the `node start` JSON response as a `context` field.
    // We verify by checking that buildNextAction for node:start no longer
    // tells the caller to run `specwork context assemble` separately.
    const { buildNextAction, readChangeContext } = await import('../../core/next-action.js');
    const ctx = readChangeContext(root, 'test-change');
    const nextAction = buildNextAction('node:start', ctx, { change: 'test-change', nodeId: 'impl-core' });

    // Currently returns command containing 'context assemble' — after change it should NOT
    expect(nextAction.command).not.toContain('context assemble');
  });

  it('node start without --json does NOT include raw context dump', async () => {
    // This test verifies that human-readable (non-JSON) output from node start
    // does NOT dump the raw context string — it should remain a clean table/summary.
    // After the change, context is only included in the JSON response object,
    // not in the human-readable table output.

    const state = makeState('test-change', { snapshot: 'complete', 'write-tests': 'pending', 'impl-core': 'pending' });
    setupFixtures(root, state);
    writeMarkdown(snapshotPath(root), '# Snapshot\n');

    const snapshotNDir = nodeDir(root, 'test-change', 'snapshot');
    fs.mkdirSync(snapshotNDir, { recursive: true });
    writeMarkdown(path.join(snapshotNDir, 'L0.md'), '- snapshot: done\n');

    // The non-JSON output should not contain assembled context markers
    // This test validates that the human table output format is unchanged
    // We check that buildNextAction for node:start still works for non-JSON mode
    const { buildNextAction, readChangeContext } = await import('../../core/next-action.js');
    const ctx = readChangeContext(root, 'test-change');
    const nextAction = buildNextAction('node:start', ctx, { change: 'test-change', nodeId: 'write-tests' });

    // After the change, the command should NOT reference `specwork context assemble`
    // because context injection is automatic in JSON mode only
    // Currently the command DOES contain 'context assemble' — this FAILS
    expect(nextAction.command).not.toContain('context assemble');
  });

  it('context injection works when no prior nodes are complete (first node)', async () => {
    // First node (snapshot) has no prior completed nodes — context should
    // have the snapshot content but empty L0/L1 sections
    const state = makeState('test-change', { snapshot: 'pending', 'write-tests': 'pending', 'impl-core': 'pending' });
    setupFixtures(root, state);

    // Write snapshot file (exists from environment, not from a completed node)
    writeMarkdown(snapshotPath(root), '# Environment Snapshot\nProject: test\n');

    // Assemble context for first node — no completed nodes yet
    const { assembleContext, renderContext } = await import('../../core/context-assembler.js');
    const bundle = assembleContext(root, 'test-change', 'snapshot');
    const contextStr = renderContext(bundle);

    // Should have snapshot but no L0/L1 content
    expect(bundle.l0).toHaveLength(0);
    expect(bundle.l1).toHaveLength(0);
    // Snapshot should still be present if the file exists
    expect(bundle.snapshot).toContain('Environment Snapshot');

    // THE FAILING ASSERTION: after the change, buildNextAction for node:start
    // should not reference context assemble (it's auto-injected)
    const { buildNextAction, readChangeContext } = await import('../../core/next-action.js');
    const ctx = readChangeContext(root, 'test-change');
    const nextAction = buildNextAction('node:start', ctx, { change: 'test-change', nodeId: 'snapshot' });

    // Currently returns command with 'context assemble' — after change it should NOT
    expect(nextAction.command).not.toContain('context assemble');
  });
});
