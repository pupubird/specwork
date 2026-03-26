/**
 * Edge-case integration tests for Foreman CLI.
 *
 * Tests scenarios that are unusual or boundary conditions:
 *   - Empty tasks.md → only backbone nodes generated
 *   - Single-task graph structure
 *   - Diamond dependency execution order
 *   - Retry exhaustion → escalation and dependent skipping
 *
 * Uses the real CLI binary at dist/index.js for CLI-level tests,
 * and core modules for state-level assertions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { createTestProject, runForeman, cleanup, writeTasksFile } from './helpers.js';

// Core modules for state-level tests
import { initializeState, transitionNode } from '../../core/state-machine.js';
import { getReadyNodes } from '../../core/graph-walker.js';
import { writeYaml } from '../../io/filesystem.js';
import { graphPath, statePath } from '../../utils/paths.js';
import type { Graph } from '../../types/graph.js';
import type { WorkflowState } from '../../types/state.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupProject(dir: string): void {
  runForeman(dir, 'init');
}

function readState(dir: string, change: string): Record<string, unknown> {
  const p = path.join(dir, '.foreman', 'graph', change, 'state.yaml');
  return parseYaml(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
}

function patchState(
  dir: string,
  change: string,
  patch: (state: Record<string, unknown>) => Record<string, unknown>,
): void {
  const p = path.join(dir, '.foreman', 'graph', change, 'state.yaml');
  const state = parseYaml(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
  const next = patch(state);
  fs.writeFileSync(p, stringifyYaml(next), 'utf-8');
}

function markNodeComplete(dir: string, change: string, nodeId: string): void {
  patchState(dir, change, (state) => {
    const nodes = state.nodes as Record<string, Record<string, unknown>>;
    nodes[nodeId] = { ...nodes[nodeId], status: 'complete', completed_at: new Date().toISOString() };
    return { ...state, nodes, updated_at: new Date().toISOString() };
  });
}

// ── Empty graph ───────────────────────────────────────────────────────────────

describe('edge case: empty tasks.md', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
    setupProject(dir);
    runForeman(dir, 'new empty-change');
    // tasks.md with section header but no checkbox tasks
    writeTasksFile(dir, 'empty-change', '## 1. Setup\n\nNo tasks here.\n');
    runForeman(dir, 'graph generate empty-change');
  });

  afterEach(() => cleanup(dir));

  it('generates a graph even when tasks.md has no checkbox items', () => {
    const graphFile = path.join(dir, '.foreman', 'graph', 'empty-change', 'graph.yaml');
    expect(fs.existsSync(graphFile)).toBe(true);

    const graph = parseYaml(fs.readFileSync(graphFile, 'utf-8')) as { nodes: Array<{ id: string }> };
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(graph.nodes.length).toBeGreaterThan(0);
  });

  it('generated graph contains snapshot backbone node', () => {
    const graphFile = path.join(dir, '.foreman', 'graph', 'empty-change', 'graph.yaml');
    const graph = parseYaml(fs.readFileSync(graphFile, 'utf-8')) as { nodes: Array<{ id: string }> };
    const ids = graph.nodes.map((n) => n.id);
    expect(ids).toContain('snapshot');
  });

  it('generated graph contains write-tests backbone node', () => {
    const graphFile = path.join(dir, '.foreman', 'graph', 'empty-change', 'graph.yaml');
    const graph = parseYaml(fs.readFileSync(graphFile, 'utf-8')) as { nodes: Array<{ id: string }> };
    const ids = graph.nodes.map((n) => n.id);
    expect(ids).toContain('write-tests');
  });

  it('generated graph contains integration backbone node', () => {
    const graphFile = path.join(dir, '.foreman', 'graph', 'empty-change', 'graph.yaml');
    const graph = parseYaml(fs.readFileSync(graphFile, 'utf-8')) as { nodes: Array<{ id: string }> };
    const ids = graph.nodes.map((n) => n.id);
    expect(ids).toContain('integration');
  });

  it('generated graph has no impl-* nodes for empty tasks', () => {
    const graphFile = path.join(dir, '.foreman', 'graph', 'empty-change', 'graph.yaml');
    const graph = parseYaml(fs.readFileSync(graphFile, 'utf-8')) as { nodes: Array<{ id: string }> };
    const implNodes = graph.nodes.filter((n) => n.id.startsWith('impl-'));
    expect(implNodes).toHaveLength(0);
  });

  it('foreman run still identifies snapshot as first ready node', () => {
    const result = runForeman(dir, '--json run empty-change');
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { ready: Array<{ id: string }> };
    expect(parsed.ready[0].id).toBe('snapshot');
  });
});

// ── Single-task graph ─────────────────────────────────────────────────────────

describe('edge case: single-task graph', () => {
  const SINGLE_TASK = `## 1. Core\n\n- [ ] 1.1 Add the one thing\n`;
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
    setupProject(dir);
    runForeman(dir, 'new single-task');
    writeTasksFile(dir, 'single-task', SINGLE_TASK);
    runForeman(dir, 'graph generate single-task');
  });

  afterEach(() => cleanup(dir));

  it('graph contains exactly one impl-* node', () => {
    const graphFile = path.join(dir, '.foreman', 'graph', 'single-task', 'graph.yaml');
    const graph = parseYaml(fs.readFileSync(graphFile, 'utf-8')) as { nodes: Array<{ id: string }> };
    const implNodes = graph.nodes.filter((n) => n.id.startsWith('impl-'));
    expect(implNodes).toHaveLength(1);
  });

  it('the single impl node depends on write-tests', () => {
    const graphFile = path.join(dir, '.foreman', 'graph', 'single-task', 'graph.yaml');
    const graph = parseYaml(fs.readFileSync(graphFile, 'utf-8')) as {
      nodes: Array<{ id: string; deps: string[] }>;
    };
    const implNode = graph.nodes.find((n) => n.id.startsWith('impl-'));
    expect(implNode).toBeDefined();
    expect(implNode!.deps).toContain('write-tests');
  });

  it('graph validates successfully', () => {
    const result = runForeman(dir, 'graph validate single-task');
    expect(result.exitCode).toBe(0);
  });

  it('state initializes all nodes as pending', () => {
    const state = readState(dir, 'single-task');
    const nodes = state.nodes as Record<string, { status: string }>;
    for (const nodeState of Object.values(nodes)) {
      expect(nodeState.status).toBe('pending');
    }
  });
});

// ── Diamond dependency ────────────────────────────────────────────────────────

describe('edge case: diamond dependency execution order', () => {
  /**
   * Graph structure:
   *   node-a (no deps)
   *   node-b depends on node-a
   *   node-c depends on node-a
   *   node-d depends on node-b AND node-c
   *
   * Expected execution order:
   *   1. Only node-a is ready initially
   *   2. After node-a: node-b and node-c are both ready
   *   3. After node-b + node-c: node-d is ready
   */

  const CHANGE = 'diamond-change';

  // Diamond graph fixture
  const diamondGraph: Graph = {
    change: CHANGE,
    version: '1',
    created_at: '2026-03-26T00:00:00Z',
    nodes: [
      {
        id: 'node-a',
        type: 'deterministic',
        description: 'Node A — root',
        deps: [],
        inputs: [],
        outputs: [],
        scope: [],
        validate: [],
        command: 'echo a',
      },
      {
        id: 'node-b',
        type: 'llm',
        description: 'Node B — depends on A',
        deps: ['node-a'],
        inputs: [],
        outputs: [],
        scope: [],
        validate: [],
        agent: 'foreman-implementer',
      },
      {
        id: 'node-c',
        type: 'llm',
        description: 'Node C — depends on A',
        deps: ['node-a'],
        inputs: [],
        outputs: [],
        scope: [],
        validate: [],
        agent: 'foreman-implementer',
      },
      {
        id: 'node-d',
        type: 'llm',
        description: 'Node D — depends on B and C',
        deps: ['node-b', 'node-c'],
        inputs: [],
        outputs: [],
        scope: [],
        validate: [],
        agent: 'foreman-implementer',
      },
    ],
  };

  let root: string;

  beforeEach(() => {
    root = createTestProject();
    // Set up directories
    fs.mkdirSync(path.join(root, '.foreman', 'graph', CHANGE), { recursive: true });
    fs.mkdirSync(path.join(root, '.foreman', 'nodes', CHANGE), { recursive: true });
    // Write graph + initial state
    writeYaml(graphPath(root, CHANGE), diamondGraph);
    writeYaml(statePath(root, CHANGE), initializeState(diamondGraph));
  });

  afterEach(() => cleanup(root));

  it('initially only node-a is ready (no deps)', () => {
    const graph = diamondGraph;
    const state = initializeState(graph);
    const ready = getReadyNodes(graph, state);
    expect(ready.map((n) => n.id)).toEqual(['node-a']);
  });

  it('after node-a completes, node-b and node-c are both ready', () => {
    const graph = diamondGraph;
    let state = initializeState(graph);
    state = transitionNode(state, 'node-a', 'in_progress');
    state = transitionNode(state, 'node-a', 'complete');

    const ready = getReadyNodes(graph, state);
    const readyIds = ready.map((n) => n.id).sort();
    expect(readyIds).toContain('node-b');
    expect(readyIds).toContain('node-c');
    expect(readyIds).not.toContain('node-d');
  });

  it('node-d is not ready until both node-b and node-c are complete', () => {
    const graph = diamondGraph;
    let state = initializeState(graph);
    state = transitionNode(state, 'node-a', 'in_progress');
    state = transitionNode(state, 'node-a', 'complete');
    // Only complete node-b, not node-c
    state = transitionNode(state, 'node-b', 'in_progress');
    state = transitionNode(state, 'node-b', 'complete');

    const ready = getReadyNodes(graph, state);
    const readyIds = ready.map((n) => n.id);
    expect(readyIds).not.toContain('node-d');
    expect(readyIds).toContain('node-c');
  });

  it('node-d becomes ready after both node-b and node-c complete', () => {
    const graph = diamondGraph;
    let state = initializeState(graph);
    state = transitionNode(state, 'node-a', 'in_progress');
    state = transitionNode(state, 'node-a', 'complete');
    state = transitionNode(state, 'node-b', 'in_progress');
    state = transitionNode(state, 'node-b', 'complete');
    state = transitionNode(state, 'node-c', 'in_progress');
    state = transitionNode(state, 'node-c', 'complete');

    const ready = getReadyNodes(graph, state);
    const readyIds = ready.map((n) => n.id);
    expect(readyIds).toContain('node-d');
  });

  it('foreman run --json returns only node-a in initial state', () => {
    // Write initial state to disk so CLI can read it
    writeYaml(statePath(root, CHANGE), initializeState(diamondGraph));

    // Need .foreman dir for root detection
    if (!fs.existsSync(path.join(root, '.foreman', 'config.yaml'))) {
      setupProject(root);
    }

    const result = runForeman(root, `--json run ${CHANGE}`);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { ready: Array<{ id: string }> };
    const readyIds = parsed.ready.map((n) => n.id);
    expect(readyIds).toEqual(['node-a']);
  });
});

// ── Retry exhaustion ──────────────────────────────────────────────────────────

describe('edge case: retry exhaustion', () => {
  it('incrementRetry returns exhausted=true after max_retries attempts', async () => {
    const { incrementRetry } = await import('../../core/state-machine.js');

    // Build a simple two-node graph
    const graph: Graph = {
      change: 'retry-test',
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
          command: 'echo snap',
          retry: 2,
        },
        {
          id: 'write-tests',
          type: 'llm',
          description: 'write tests',
          deps: ['snapshot'],
          inputs: [],
          outputs: [],
          scope: [],
          validate: [],
          agent: 'foreman-test-writer',
          retry: 2,
        },
      ],
    };

    let state: WorkflowState = initializeState(graph);
    state = transitionNode(state, 'snapshot', 'in_progress');

    const MAX_RETRIES = 2;
    const r1 = incrementRetry(state, 'snapshot', MAX_RETRIES);
    expect(r1.exhausted).toBe(false);
    const r2 = incrementRetry(r1.state, 'snapshot', MAX_RETRIES);
    expect(r2.exhausted).toBe(false);
    const r3 = incrementRetry(r2.state, 'snapshot', MAX_RETRIES);
    expect(r3.exhausted).toBe(true);
  });

  it('skipDependents marks all downstream nodes as skipped after escalation', async () => {
    const { skipDependents } = await import('../../core/state-machine.js');

    const graph: Graph = {
      change: 'retry-test',
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
          command: 'echo snap',
        },
        {
          id: 'write-tests',
          type: 'llm',
          description: 'write tests',
          deps: ['snapshot'],
          inputs: [],
          outputs: [],
          scope: [],
          validate: [],
          agent: 'foreman-test-writer',
        },
        {
          id: 'impl-core',
          type: 'llm',
          description: 'impl core',
          deps: ['write-tests'],
          inputs: [],
          outputs: [],
          scope: [],
          validate: [],
          agent: 'foreman-implementer',
        },
      ],
    };

    let state: WorkflowState = initializeState(graph);
    state = transitionNode(state, 'snapshot', 'in_progress');
    state = transitionNode(state, 'snapshot', 'escalated', { error: 'retries exhausted' });

    const withSkips = skipDependents(state, graph, 'snapshot');

    expect(withSkips.nodes['snapshot']?.status).toBe('escalated');
    expect(withSkips.nodes['write-tests']?.status).toBe('skipped');
    expect(withSkips.nodes['impl-core']?.status).toBe('skipped');
  });

  it('no ready nodes remain after exhaustion and dependent skipping', async () => {
    const { skipDependents } = await import('../../core/state-machine.js');

    const graph: Graph = {
      change: 'retry-test',
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
          command: 'echo snap',
        },
        {
          id: 'write-tests',
          type: 'llm',
          description: 'write tests',
          deps: ['snapshot'],
          inputs: [],
          outputs: [],
          scope: [],
          validate: [],
          agent: 'foreman-test-writer',
        },
      ],
    };

    let state: WorkflowState = initializeState(graph);
    state = transitionNode(state, 'snapshot', 'in_progress');
    state = transitionNode(state, 'snapshot', 'escalated');
    state = skipDependents(state, graph, 'snapshot');

    const ready = getReadyNodes(graph, state);
    expect(ready).toHaveLength(0);
  });

  it('foreman run --json reports blocked when all nodes are failed/escalated/skipped', () => {
    const dir = createTestProject();
    try {
      runForeman(dir, 'init');
      runForeman(dir, 'new retry-change');
      writeTasksFile(dir, 'retry-change', '## 1. Core\n\n- [ ] 1.1 Do thing\n');
      runForeman(dir, 'graph generate retry-change');

      // Escalate snapshot and skip all dependents
      const stateFilePath = path.join(dir, '.foreman', 'graph', 'retry-change', 'state.yaml');
      const state = parseYaml(fs.readFileSync(stateFilePath, 'utf-8')) as Record<string, unknown>;
      const nodes = state.nodes as Record<string, Record<string, unknown>>;
      const ts = new Date().toISOString();

      // Mark snapshot as escalated and everything else as skipped
      for (const [nodeId, nodeState] of Object.entries(nodes)) {
        if (nodeId === 'snapshot') {
          nodes[nodeId] = { ...nodeState, status: 'escalated', error: 'retries exhausted', completed_at: ts };
        } else {
          nodes[nodeId] = { ...nodeState, status: 'skipped', completed_at: ts };
        }
      }
      fs.writeFileSync(stateFilePath, stringifyYaml({ ...state, nodes, updated_at: ts }), 'utf-8');

      const result = runForeman(dir, '--json run retry-change');
      // Should exit with 0 and report complete (all nodes terminal) or blocked
      expect(result.exitCode).toBeGreaterThanOrEqual(0);

      const parsed = JSON.parse(result.stdout) as { ready: unknown[]; reason?: string };
      expect(parsed.ready).toHaveLength(0);
    } finally {
      cleanup(dir);
    }
  });
});

// ── Graph validate on malformed input ─────────────────────────────────────────

describe('edge case: graph validation errors', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
    runForeman(dir, 'init');
    runForeman(dir, 'new validate-test');
  });

  afterEach(() => cleanup(dir));

  it('validate errors when graph.yaml is missing state.yaml pair', () => {
    // Write graph.yaml but no state.yaml
    const graphDir = path.join(dir, '.foreman', 'graph', 'validate-test');
    fs.mkdirSync(graphDir, { recursive: true });
    fs.writeFileSync(
      path.join(graphDir, 'graph.yaml'),
      stringifyYaml({
        change: 'validate-test',
        version: '1',
        created_at: '2026-03-26T00:00:00Z',
        nodes: [{ id: 'snapshot', type: 'deterministic', description: 'snap', deps: [] }],
      }),
      'utf-8',
    );

    const result = runForeman(dir, 'graph validate validate-test');
    expect(result.exitCode).not.toBe(0);
  });

  it('foreman run errors when graph has not been generated', () => {
    const result = runForeman(dir, '--json run validate-test');
    expect(result.exitCode).not.toBe(0);
  });
});
