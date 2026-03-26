import { describe, it, expect } from 'vitest';
import {
  initializeState,
  transitionNode,
  incrementRetry,
  skipDependents,
  isTerminal,
  getChangeStatus,
} from '../../core/state-machine.js';
import type { Graph } from '../../types/graph.js';
import type { WorkflowState } from '../../types/state.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeGraph = (overrides?: Partial<Graph>): Graph => ({
  change: 'test-change',
  version: '1',
  created_at: '2026-03-26T00:00:00Z',
  nodes: [
    {
      id: 'snapshot',
      type: 'deterministic',
      description: 'Environment snapshot',
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
      description: 'Write tests',
      agent: 'foreman-test-writer',
      deps: ['snapshot'],
      inputs: [],
      outputs: [],
      scope: ['src/__tests__/'],
      validate: [],
    },
    {
      id: 'impl-core',
      type: 'llm',
      description: 'Implement core',
      agent: 'foreman-implementer',
      deps: ['write-tests'],
      inputs: [],
      outputs: [],
      scope: ['src/core/'],
      validate: [],
    },
  ],
  ...overrides,
});

// ── initializeState ───────────────────────────────────────────────────────────

describe('initializeState', () => {
  it('creates pending state for every node', () => {
    const graph = makeGraph();
    const state = initializeState(graph);

    expect(Object.keys(state.nodes)).toHaveLength(3);
    for (const ns of Object.values(state.nodes)) {
      expect(ns.status).toBe('pending');
      expect(ns.started_at).toBeNull();
      expect(ns.completed_at).toBeNull();
      expect(ns.retries).toBe(0);
      expect(ns.error).toBeNull();
      expect(ns.l0).toBeNull();
    }
  });

  it('sets change name, active status, and timestamps', () => {
    const graph = makeGraph();
    const before = Date.now();
    const state = initializeState(graph);
    const after = Date.now();

    expect(state.change).toBe('test-change');
    expect(state.status).toBe('active');
    expect(state.lock).toBeNull();

    const ts = new Date(state.started_at).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

// ── transitionNode ────────────────────────────────────────────────────────────

describe('transitionNode', () => {
  it('transitions pending → in_progress', () => {
    const graph = makeGraph();
    const state = initializeState(graph);
    const updated = transitionNode(state, 'snapshot', 'in_progress');

    expect(updated.nodes['snapshot']!.status).toBe('in_progress');
    expect(updated.nodes['snapshot']!.started_at).not.toBeNull();
  });

  it('transitions in_progress → complete and sets completed_at', () => {
    const graph = makeGraph();
    let state = initializeState(graph);
    state = transitionNode(state, 'snapshot', 'in_progress');
    state = transitionNode(state, 'snapshot', 'complete', { l0: '- snapshot: complete, 1 file' });

    expect(state.nodes['snapshot']!.status).toBe('complete');
    expect(state.nodes['snapshot']!.completed_at).not.toBeNull();
    expect(state.nodes['snapshot']!.l0).toBe('- snapshot: complete, 1 file');
  });

  it('transitions in_progress → failed and stores error', () => {
    const graph = makeGraph();
    let state = initializeState(graph);
    state = transitionNode(state, 'snapshot', 'in_progress');
    state = transitionNode(state, 'snapshot', 'failed', { error: 'command exit 1' });

    expect(state.nodes['snapshot']!.status).toBe('failed');
    expect(state.nodes['snapshot']!.error).toBe('command exit 1');
  });

  it('allows retry: failed → in_progress', () => {
    const graph = makeGraph();
    let state = initializeState(graph);
    state = transitionNode(state, 'snapshot', 'in_progress');
    state = transitionNode(state, 'snapshot', 'failed');
    state = transitionNode(state, 'snapshot', 'in_progress');

    expect(state.nodes['snapshot']!.status).toBe('in_progress');
  });

  it('allows escalated → in_progress (manual retry)', () => {
    const graph = makeGraph();
    let state = initializeState(graph);
    state = transitionNode(state, 'snapshot', 'in_progress');
    state = transitionNode(state, 'snapshot', 'escalated');
    state = transitionNode(state, 'snapshot', 'in_progress');

    expect(state.nodes['snapshot']!.status).toBe('in_progress');
  });

  it('throws on invalid transition: pending → complete', () => {
    const graph = makeGraph();
    const state = initializeState(graph);

    expect(() => transitionNode(state, 'snapshot', 'complete')).toThrow(
      'Invalid transition'
    );
  });

  it('throws on invalid transition: complete → in_progress', () => {
    const graph = makeGraph();
    let state = initializeState(graph);
    state = transitionNode(state, 'snapshot', 'in_progress');
    state = transitionNode(state, 'snapshot', 'complete');

    expect(() => transitionNode(state, 'snapshot', 'in_progress')).toThrow(
      'Invalid transition'
    );
  });

  it('throws on invalid transition: skipped → in_progress', () => {
    const graph = makeGraph();
    let state = initializeState(graph);
    state = transitionNode(state, 'snapshot', 'skipped');

    expect(() => transitionNode(state, 'snapshot', 'in_progress')).toThrow(
      'Invalid transition'
    );
  });

  it('throws when node not found in state', () => {
    const graph = makeGraph();
    const state = initializeState(graph);

    expect(() => transitionNode(state, 'nonexistent', 'in_progress')).toThrow(
      'not found in state'
    );
  });

  it('does not mutate the original state', () => {
    const graph = makeGraph();
    const state = initializeState(graph);
    const updated = transitionNode(state, 'snapshot', 'in_progress');

    expect(state.nodes['snapshot']!.status).toBe('pending');
    expect(updated.nodes['snapshot']!.status).toBe('in_progress');
  });
});

// ── incrementRetry ────────────────────────────────────────────────────────────

describe('incrementRetry', () => {
  it('increments retry count', () => {
    const graph = makeGraph();
    const state = initializeState(graph);
    const { state: updated } = incrementRetry(state, 'snapshot', 2);

    expect(updated.nodes['snapshot']!.retries).toBe(1);
    expect(state.nodes['snapshot']!.retries).toBe(0); // original unchanged
  });

  it('returns exhausted=false when under limit', () => {
    const graph = makeGraph();
    const state = initializeState(graph);
    const { exhausted } = incrementRetry(state, 'snapshot', 2);

    expect(exhausted).toBe(false);
  });

  it('returns exhausted=true when at limit', () => {
    const graph = makeGraph();
    let state = initializeState(graph);

    // Increment past limit (maxRetries = 2, so 3rd retry is exhausted)
    state = incrementRetry(state, 'snapshot', 2).state;
    state = incrementRetry(state, 'snapshot', 2).state;
    const { exhausted } = incrementRetry(state, 'snapshot', 2);

    expect(exhausted).toBe(true);
  });

  it('throws when node not found', () => {
    const graph = makeGraph();
    const state = initializeState(graph);

    expect(() => incrementRetry(state, 'missing', 2)).toThrow('not found in state');
  });
});

// ── skipDependents ────────────────────────────────────────────────────────────

describe('skipDependents', () => {
  it('skips all downstream pending nodes', () => {
    const graph = makeGraph();
    const state = initializeState(graph);
    const updated = skipDependents(state, graph, 'snapshot');

    // write-tests depends on snapshot, impl-core depends on write-tests
    expect(updated.nodes['write-tests']!.status).toBe('skipped');
    expect(updated.nodes['impl-core']!.status).toBe('skipped');
    // snapshot itself unchanged
    expect(updated.nodes['snapshot']!.status).toBe('pending');
  });

  it('sets error message referencing the failed upstream node', () => {
    const graph = makeGraph();
    const state = initializeState(graph);
    const updated = skipDependents(state, graph, 'snapshot');

    expect(updated.nodes['write-tests']!.error).toContain('snapshot');
  });

  it('does not skip already-complete nodes', () => {
    const graph = makeGraph();
    let state = initializeState(graph);
    state = transitionNode(state, 'write-tests', 'in_progress');
    state = transitionNode(state, 'write-tests', 'complete');

    const updated = skipDependents(state, graph, 'snapshot');

    // write-tests already complete — must not be overwritten to skipped
    expect(updated.nodes['write-tests']!.status).toBe('complete');
    // impl-core still pending — should be skipped
    expect(updated.nodes['impl-core']!.status).toBe('skipped');
  });

  it('does not mutate original state', () => {
    const graph = makeGraph();
    const state = initializeState(graph);
    skipDependents(state, graph, 'snapshot');

    expect(state.nodes['write-tests']!.status).toBe('pending');
  });

  it('handles node with no dependents', () => {
    const graph = makeGraph();
    const state = initializeState(graph);
    const updated = skipDependents(state, graph, 'impl-core'); // leaf node

    // Nothing else depends on impl-core
    expect(updated.nodes['snapshot']!.status).toBe('pending');
    expect(updated.nodes['write-tests']!.status).toBe('pending');
    expect(updated.nodes['impl-core']!.status).toBe('pending');
  });
});

// ── isTerminal ────────────────────────────────────────────────────────────────

describe('isTerminal', () => {
  it('complete is terminal', () => expect(isTerminal('complete')).toBe(true));
  it('rejected is terminal', () => expect(isTerminal('rejected')).toBe(true));
  it('skipped is terminal', () => expect(isTerminal('skipped')).toBe(true));
  it('pending is not terminal', () => expect(isTerminal('pending')).toBe(false));
  it('in_progress is not terminal', () => expect(isTerminal('in_progress')).toBe(false));
  it('failed is not terminal', () => expect(isTerminal('failed')).toBe(false));
  it('escalated is not terminal', () => expect(isTerminal('escalated')).toBe(false));
});

// ── getChangeStatus ───────────────────────────────────────────────────────────

describe('getChangeStatus', () => {
  it('returns active when all nodes pending', () => {
    const graph = makeGraph();
    const state = initializeState(graph);
    expect(getChangeStatus(state)).toBe('active');
  });

  it('returns active when a node is in_progress', () => {
    const graph = makeGraph();
    let state = initializeState(graph);
    state = transitionNode(state, 'snapshot', 'in_progress');
    expect(getChangeStatus(state)).toBe('active');
  });

  it('returns failed when a node is failed', () => {
    const graph = makeGraph();
    let state = initializeState(graph);
    state = transitionNode(state, 'snapshot', 'in_progress');
    state = transitionNode(state, 'snapshot', 'failed');
    expect(getChangeStatus(state)).toBe('failed');
  });

  it('returns failed when a node is escalated', () => {
    const graph = makeGraph();
    let state = initializeState(graph);
    state = transitionNode(state, 'snapshot', 'in_progress');
    state = transitionNode(state, 'snapshot', 'escalated');
    expect(getChangeStatus(state)).toBe('failed');
  });

  it('returns complete when all nodes are complete or skipped', () => {
    const graph = makeGraph();
    let state = initializeState(graph);
    for (const id of ['snapshot', 'write-tests', 'impl-core']) {
      state = transitionNode(state, id, 'in_progress');
      state = transitionNode(state, id, 'complete');
    }
    expect(getChangeStatus(state)).toBe('complete');
  });

  it('returns failed when a node is rejected', () => {
    const graph = makeGraph();
    let state = initializeState(graph);
    state = transitionNode(state, 'snapshot', 'in_progress');
    state = transitionNode(state, 'snapshot', 'rejected');
    // remaining nodes are pending — still terminal check
    state = skipDependents(state, graph, 'snapshot');
    expect(getChangeStatus(state)).toBe('failed');
  });
});
