import { describe, it, expect } from 'vitest';
import * as graphWalker from '../../core/graph-walker.js';
import * as stateMachine from '../../core/state-machine.js';
import { initializeState, transitionNode } from '../../core/state-machine.js';
import { getReadyNodes } from '../../core/graph-walker.js';
import type { Graph } from '../../types/graph.js';
import type { WorkflowState } from '../../types/state.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/**
 * Wide graph: snapshot → [n1..nN] — all impl nodes ready simultaneously after snapshot
 */
const wideGraph = (count: number): Graph => ({
  change: 'wave-test',
  version: '1',
  created_at: '2026-03-30T00:00:00Z',
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
      command: 'echo',
    },
    ...Array.from({ length: count }, (_, i) => ({
      id: `impl-${i + 1}`,
      type: 'llm' as const,
      description: `impl ${i + 1}`,
      agent: 'specwork-implementer',
      deps: ['snapshot'],
      inputs: [],
      outputs: [],
      scope: [],
      validate: [],
    })),
  ],
});

/**
 * Two-wave graph: snapshot → [a, b, c] → [d, e]
 */
const twoWaveGraph = (): Graph => ({
  change: 'two-wave',
  version: '1',
  created_at: '2026-03-30T00:00:00Z',
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
      command: 'echo',
    },
    {
      id: 'impl-a',
      type: 'llm',
      description: 'impl a',
      agent: 'specwork-implementer',
      deps: ['snapshot'],
      inputs: [],
      outputs: [],
      scope: [],
      validate: [],
    },
    {
      id: 'impl-b',
      type: 'llm',
      description: 'impl b',
      agent: 'specwork-implementer',
      deps: ['snapshot'],
      inputs: [],
      outputs: [],
      scope: [],
      validate: [],
    },
    {
      id: 'impl-c',
      type: 'llm',
      description: 'impl c',
      agent: 'specwork-implementer',
      deps: ['snapshot'],
      inputs: [],
      outputs: [],
      scope: [],
      validate: [],
    },
    {
      id: 'impl-d',
      type: 'llm',
      description: 'impl d',
      agent: 'specwork-implementer',
      deps: ['impl-a', 'impl-b'],
      inputs: [],
      outputs: [],
      scope: [],
      validate: [],
    },
    {
      id: 'impl-e',
      type: 'llm',
      description: 'impl e',
      agent: 'specwork-implementer',
      deps: ['impl-c'],
      inputs: [],
      outputs: [],
      scope: [],
      validate: [],
    },
  ],
});

/** Helper: complete snapshot so impl nodes become ready */
function completeSnapshot(graph: Graph): WorkflowState {
  let state = initializeState(graph);
  state = transitionNode(state, 'snapshot', 'in_progress');
  state = transitionNode(state, 'snapshot', 'complete');
  return state;
}

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: max_concurrent Configuration
// ══════════════════════════════════════════════════════════════════════════════

describe('getNextWave', () => {
  it('is exported from graph-walker', () => {
    // getNextWave must be a new exported function
    expect(graphWalker).toHaveProperty('getNextWave');
    expect(typeof (graphWalker as any).getNextWave).toBe('function');
  });

  it('caps wave size at maxConcurrent', () => {
    // Spec: Given 10 ready nodes and max_concurrent=3, exactly 3 are selected
    const graph = wideGraph(10);
    const state = completeSnapshot(graph);

    const getNextWave = (graphWalker as any).getNextWave;
    const wave = getNextWave(graph, state, { maxConcurrent: 3 });
    expect(wave).toHaveLength(3);
  });

  it('defaults max_concurrent to 5 when not configured', () => {
    // Spec: Given 8 ready nodes and no max_concurrent, exactly 5 are selected
    const graph = wideGraph(8);
    const state = completeSnapshot(graph);

    const getNextWave = (graphWalker as any).getNextWave;
    const wave = getNextWave(graph, state);
    expect(wave).toHaveLength(5);
  });

  it('returns all ready nodes when fewer than maxConcurrent', () => {
    // Spec: Given 2 ready nodes and max_concurrent=5, both are selected
    const graph = wideGraph(2);
    const state = completeSnapshot(graph);

    const getNextWave = (graphWalker as any).getNextWave;
    const wave = getNextWave(graph, state, { maxConcurrent: 5 });
    expect(wave).toHaveLength(2);
  });

  it('returns GraphNode objects (not just ids)', () => {
    const graph = wideGraph(3);
    const state = completeSnapshot(graph);

    const getNextWave = (graphWalker as any).getNextWave;
    const wave = getNextWave(graph, state, { maxConcurrent: 2 });
    expect(wave[0]).toHaveProperty('id');
    expect(wave[0]).toHaveProperty('type');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Wave Tracking in State
// ══════════════════════════════════════════════════════════════════════════════

describe('wave tracking in state', () => {
  it('initializes current_wave to 0 for new workflows', () => {
    // Spec: current_wave SHALL equal 0 on initialization
    const graph = wideGraph(3);
    const state = initializeState(graph);
    expect((state as any).current_wave).toBe(0);
  });

  it('dispatchWave is exported from state-machine', () => {
    expect(stateMachine).toHaveProperty('dispatchWave');
    expect(typeof (stateMachine as any).dispatchWave).toBe('function');
  });

  it('increments current_wave when a wave is dispatched', () => {
    // Spec: current_wave increments by 1 each dispatch
    const graph = wideGraph(3);
    const state = initializeState(graph);

    const dispatchWave = (stateMachine as any).dispatchWave;
    const updated = dispatchWave(state, ['impl-1', 'impl-2', 'impl-3']);
    expect(updated.current_wave).toBe(1);
  });

  it('tracks cumulative wave numbers across multiple dispatches', () => {
    const graph = twoWaveGraph();
    let state = completeSnapshot(graph);

    const dispatchWave = (stateMachine as any).dispatchWave;

    // First wave
    state = dispatchWave(state, ['impl-a', 'impl-b', 'impl-c']);
    expect(state.current_wave).toBe(1);

    // Complete first wave nodes
    for (const id of ['impl-a', 'impl-b', 'impl-c']) {
      state = transitionNode(state, id, 'in_progress');
      state = transitionNode(state, id, 'complete');
    }

    // Second wave
    state = dispatchWave(state, ['impl-d', 'impl-e']);
    expect(state.current_wave).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Wave Gate Auto-Continue
// ══════════════════════════════════════════════════════════════════════════════

describe('wave gate behavior', () => {
  it('shouldWaveAutoContinue is exported from graph-walker', () => {
    expect(graphWalker).toHaveProperty('shouldWaveAutoContinue');
    expect(typeof (graphWalker as any).shouldWaveAutoContinue).toBe('function');
  });

  it('auto-continues after a clean wave (all PASS, no regressions)', () => {
    // Spec: clean wave → auto dispatch next wave, no user confirmation
    const graph = twoWaveGraph();
    let state = completeSnapshot(graph);

    const shouldWaveAutoContinue = (graphWalker as any).shouldWaveAutoContinue;

    // Simulate wave completion: all nodes complete, no failures
    const waveNodes = ['impl-a', 'impl-b', 'impl-c'];
    for (const id of waveNodes) {
      state = transitionNode(state, id, 'in_progress');
      state = transitionNode(state, id, 'complete');
    }

    const result = shouldWaveAutoContinue(graph, state, waveNodes);
    expect(result.autoContinue).toBe(true);
    expect(result.pauseReason).toBeUndefined();
  });

  it('pauses when a node in the wave failed', () => {
    // Spec: wave with failure → pause execution
    const graph = twoWaveGraph();
    let state = completeSnapshot(graph);

    const shouldWaveAutoContinue = (graphWalker as any).shouldWaveAutoContinue;

    const waveNodes = ['impl-a', 'impl-b', 'impl-c'];
    state = transitionNode(state, 'impl-a', 'in_progress');
    state = transitionNode(state, 'impl-a', 'complete');
    state = transitionNode(state, 'impl-b', 'in_progress');
    state = transitionNode(state, 'impl-b', 'failed', { error: 'build error' });
    state = transitionNode(state, 'impl-c', 'in_progress');
    state = transitionNode(state, 'impl-c', 'complete');

    const result = shouldWaveAutoContinue(graph, state, waveNodes);
    expect(result.autoContinue).toBe(false);
    expect(result.pauseReason).toMatch(/fail/i);
  });

  it('pauses when a node in the wave has regressions', () => {
    // Spec: regression detected → pause execution with regression details
    const graph = twoWaveGraph();
    let state = completeSnapshot(graph);

    const shouldWaveAutoContinue = (graphWalker as any).shouldWaveAutoContinue;

    const waveNodes = ['impl-a', 'impl-b', 'impl-c'];
    for (const id of waveNodes) {
      state = transitionNode(state, id, 'in_progress');
      state = transitionNode(state, id, 'complete');
    }
    // Inject regression data into verify_history
    state = {
      ...state,
      nodes: {
        ...state.nodes,
        'impl-b': {
          ...state.nodes['impl-b']!,
          verify_history: [
            {
              attempt: 1,
              verdict: 'PASS' as const,
              timestamp: new Date().toISOString(),
              checks: [],
              regressions: ['scope-check previously passed, now fails'],
            },
          ],
        },
      },
    };

    const result = shouldWaveAutoContinue(graph, state, waveNodes);
    expect(result.autoContinue).toBe(false);
    expect(result.pauseReason).toMatch(/regression/i);
  });

  it('pauses when a node in the wave has gate:human', () => {
    // Spec: gate:human node → pause for user approval
    const graph: Graph = {
      change: 'gate-test',
      version: '1',
      created_at: '2026-03-30T00:00:00Z',
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
          command: 'echo',
        },
        {
          id: 'write-tests',
          type: 'llm',
          description: 'write tests',
          agent: 'specwork-test-writer',
          gate: 'human',
          deps: ['snapshot'],
          inputs: [],
          outputs: [],
          scope: [],
          validate: [],
        },
        {
          id: 'impl-1',
          type: 'llm',
          description: 'impl 1',
          agent: 'specwork-implementer',
          deps: ['snapshot'],
          inputs: [],
          outputs: [],
          scope: [],
          validate: [],
        },
      ],
    };

    let state = initializeState(graph);
    state = transitionNode(state, 'snapshot', 'in_progress');
    state = transitionNode(state, 'snapshot', 'complete');

    const shouldWaveAutoContinue = (graphWalker as any).shouldWaveAutoContinue;

    const waveNodes = ['write-tests', 'impl-1'];
    for (const id of waveNodes) {
      state = transitionNode(state, id, 'in_progress');
      state = transitionNode(state, id, 'complete');
    }

    const result = shouldWaveAutoContinue(graph, state, waveNodes);
    expect(result.autoContinue).toBe(false);
    expect(result.pauseReason).toMatch(/gate.*human/i);
  });
});
