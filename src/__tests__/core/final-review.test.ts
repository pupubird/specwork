import { describe, it, expect } from 'vitest';
import {
  initializeState,
  transitionNode,
  getChangeStatus,
} from '../../core/state-machine.js';
import { buildNextAction } from '../../core/next-action.js';
import type { Graph } from '../../types/graph.js';
import type { ChangeStatus } from '../../types/state.js';

const makeGraph = (overrides?: Partial<Graph>): Graph => ({
  change: 'test-change',
  version: '1',
  created_at: '2026-03-30T00:00:00Z',
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
      agent: 'specwork-test-writer',
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
      agent: 'specwork-implementer',
      deps: ['write-tests'],
      inputs: [],
      outputs: [],
      scope: ['src/core/'],
      validate: [],
    },
  ],
  ...overrides,
});

function completeAllNodes(graph: Graph) {
  let state = initializeState(graph);
  for (const node of graph.nodes) {
    state = transitionNode(state, node.id, 'in_progress');
    state = transitionNode(state, node.id, 'complete');
  }
  return state;
}

describe('done flow after all nodes complete', () => {
  it('getChangeStatus returns complete when all nodes are terminal', () => {
    const graph = makeGraph();
    const state = completeAllNodes(graph);

    const result = getChangeStatus(state);
    const validStatuses: ChangeStatus[] = ['active', 'complete', 'failed', 'paused'];
    expect(validStatuses).toContain(result);
    expect(result).toBe('complete');
  });

  it('go:done action shows normal done suggestions', () => {
    const action = buildNextAction('go:done', 'Add anti-deferral enforcement', {
      change: 'add-anti-deferral',
    });

    expect(action.command).toBe('suggest');
    expect(action.on_pass).toBeUndefined();
    expect(action.on_fail).toBeUndefined();
    expect(action.suggest_to_user).toBeDefined();
  });
});
