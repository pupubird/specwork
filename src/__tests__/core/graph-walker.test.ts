import { describe, it, expect } from 'vitest';
import {
  getReadyNodes,
  getBlockedNodes,
  topologicalSort,
  getParents,
  getDescendants,
  detectCycles,
  getNode,
  getSiblings,
} from '../../core/graph-walker.js';
import { initializeState, transitionNode } from '../../core/state-machine.js';
import type { Graph } from '../../types/graph.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/**
 * Linear chain: snapshot → write-tests → impl-core
 */
const linearGraph = (): Graph => ({
  change: 'test-change',
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
      command: 'echo',
    },
    {
      id: 'write-tests',
      type: 'llm',
      description: 'write tests',
      agent: 'specwork-test-writer',
      deps: ['snapshot'],
      inputs: [],
      outputs: [],
      scope: [],
      validate: [],
    },
    {
      id: 'impl-core',
      type: 'llm',
      description: 'implement core',
      agent: 'specwork-implementer',
      deps: ['write-tests'],
      inputs: [],
      outputs: [],
      scope: [],
      validate: [],
    },
  ],
});

/**
 * Diamond: snapshot → [impl-a, impl-b] → integration
 */
const diamondGraph = (): Graph => ({
  change: 'diamond',
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
      id: 'integration',
      type: 'deterministic',
      description: 'integration',
      deps: ['impl-a', 'impl-b'],
      inputs: [],
      outputs: [],
      scope: [],
      validate: [],
      command: 'npm test',
    },
  ],
});

/**
 * Graph with a cycle: a → b → c → a
 */
const cyclicGraph = (): Graph => ({
  change: 'cyclic',
  version: '1',
  created_at: '2026-03-26T00:00:00Z',
  nodes: [
    {
      id: 'a',
      type: 'deterministic',
      description: 'a',
      deps: ['c'],
      inputs: [],
      outputs: [],
      scope: [],
      validate: [],
      command: 'echo',
    },
    {
      id: 'b',
      type: 'deterministic',
      description: 'b',
      deps: ['a'],
      inputs: [],
      outputs: [],
      scope: [],
      validate: [],
      command: 'echo',
    },
    {
      id: 'c',
      type: 'deterministic',
      description: 'c',
      deps: ['b'],
      inputs: [],
      outputs: [],
      scope: [],
      validate: [],
      command: 'echo',
    },
  ],
});

// ── getNode ───────────────────────────────────────────────────────────────────

describe('getNode', () => {
  it('returns the node by id', () => {
    const graph = linearGraph();
    const node = getNode(graph, 'snapshot');
    expect(node?.id).toBe('snapshot');
  });

  it('returns undefined for missing node', () => {
    const graph = linearGraph();
    expect(getNode(graph, 'nonexistent')).toBeUndefined();
  });
});

// ── getReadyNodes ─────────────────────────────────────────────────────────────

describe('getReadyNodes', () => {
  it('returns root nodes when all pending', () => {
    const graph = linearGraph();
    const state = initializeState(graph);
    const ready = getReadyNodes(graph, state);

    expect(ready.map(n => n.id)).toEqual(['snapshot']);
  });

  it('returns next node after root completes', () => {
    const graph = linearGraph();
    let state = initializeState(graph);
    state = transitionNode(state, 'snapshot', 'in_progress');
    state = transitionNode(state, 'snapshot', 'complete');

    const ready = getReadyNodes(graph, state);
    expect(ready.map(n => n.id)).toEqual(['write-tests']);
  });

  it('returns both parallel nodes in diamond graph after root completes', () => {
    const graph = diamondGraph();
    let state = initializeState(graph);
    state = transitionNode(state, 'snapshot', 'in_progress');
    state = transitionNode(state, 'snapshot', 'complete');

    const ready = getReadyNodes(graph, state).map(n => n.id).sort();
    expect(ready).toEqual(['impl-a', 'impl-b'].sort());
  });

  it('returns integration only after both parallel nodes complete', () => {
    const graph = diamondGraph();
    let state = initializeState(graph);
    state = transitionNode(state, 'snapshot', 'in_progress');
    state = transitionNode(state, 'snapshot', 'complete');
    state = transitionNode(state, 'impl-a', 'in_progress');
    state = transitionNode(state, 'impl-a', 'complete');

    // Only impl-a done — integration still blocked
    expect(getReadyNodes(graph, state).map(n => n.id)).toEqual(['impl-b']);

    state = transitionNode(state, 'impl-b', 'in_progress');
    state = transitionNode(state, 'impl-b', 'complete');
    expect(getReadyNodes(graph, state).map(n => n.id)).toEqual(['integration']);
  });

  it('returns empty when all nodes complete', () => {
    const graph = linearGraph();
    let state = initializeState(graph);
    for (const id of ['snapshot', 'write-tests', 'impl-core']) {
      state = transitionNode(state, id, 'in_progress');
      state = transitionNode(state, id, 'complete');
    }
    expect(getReadyNodes(graph, state)).toHaveLength(0);
  });

  it('does not return in_progress nodes as ready', () => {
    const graph = linearGraph();
    let state = initializeState(graph);
    state = transitionNode(state, 'snapshot', 'in_progress');

    // snapshot is in_progress, not pending — should not appear
    expect(getReadyNodes(graph, state)).toHaveLength(0);
  });
});

// ── getBlockedNodes ───────────────────────────────────────────────────────────

describe('getBlockedNodes', () => {
  it('returns downstream nodes when deps are pending', () => {
    const graph = linearGraph();
    const state = initializeState(graph);
    const blocked = getBlockedNodes(graph, state).map(n => n.id).sort();

    // write-tests and impl-core are blocked (snapshot pending)
    expect(blocked).toContain('write-tests');
    expect(blocked).toContain('impl-core');
  });

  it('does not include the ready root node', () => {
    const graph = linearGraph();
    const state = initializeState(graph);
    const blocked = getBlockedNodes(graph, state).map(n => n.id);

    expect(blocked).not.toContain('snapshot');
  });
});

// ── getParents ────────────────────────────────────────────────────────────────

describe('getParents', () => {
  it('returns empty for root node', () => {
    expect(getParents(linearGraph(), 'snapshot')).toEqual([]);
  });

  it('returns direct deps', () => {
    expect(getParents(linearGraph(), 'write-tests')).toEqual(['snapshot']);
    expect(getParents(diamondGraph(), 'integration').sort()).toEqual(['impl-a', 'impl-b'].sort());
  });

  it('throws for unknown node', () => {
    expect(() => getParents(linearGraph(), 'missing')).toThrow('missing');
  });
});

// ── getDescendants ────────────────────────────────────────────────────────────

describe('getDescendants', () => {
  it('returns all transitive descendants', () => {
    const graph = linearGraph();
    const desc = getDescendants(graph, 'snapshot').sort();
    expect(desc).toEqual(['impl-core', 'write-tests'].sort());
  });

  it('returns direct and transitive for diamond graph', () => {
    const graph = diamondGraph();
    const desc = getDescendants(graph, 'snapshot').sort();
    expect(desc).toEqual(['impl-a', 'impl-b', 'integration'].sort());
  });

  it('returns empty for leaf node', () => {
    expect(getDescendants(linearGraph(), 'impl-core')).toHaveLength(0);
  });
});

// ── detectCycles ──────────────────────────────────────────────────────────────

describe('detectCycles', () => {
  it('returns empty array for acyclic graph', () => {
    expect(detectCycles(linearGraph())).toHaveLength(0);
    expect(detectCycles(diamondGraph())).toHaveLength(0);
  });

  it('detects a cycle', () => {
    const cycles = detectCycles(cyclicGraph());
    expect(cycles.length).toBeGreaterThan(0);

    // Each cycle should contain the repeated node
    const allNodes = cycles.flat();
    expect(allNodes).toContain('a');
  });
});

// ── topologicalSort ───────────────────────────────────────────────────────────

describe('topologicalSort', () => {
  it('sorts linear graph in dependency order', () => {
    const order = topologicalSort(linearGraph());
    expect(order).toEqual(['snapshot', 'write-tests', 'impl-core']);
  });

  it('puts both parallel nodes after snapshot in diamond graph', () => {
    const order = topologicalSort(diamondGraph());

    expect(order.indexOf('snapshot')).toBeLessThan(order.indexOf('impl-a'));
    expect(order.indexOf('snapshot')).toBeLessThan(order.indexOf('impl-b'));
    expect(order.indexOf('impl-a')).toBeLessThan(order.indexOf('integration'));
    expect(order.indexOf('impl-b')).toBeLessThan(order.indexOf('integration'));
  });

  it('throws for cyclic graph', () => {
    expect(() => topologicalSort(cyclicGraph())).toThrow();
  });

  it('includes all nodes', () => {
    const graph = diamondGraph();
    const order = topologicalSort(graph);
    expect(order).toHaveLength(graph.nodes.length);
    expect(order.sort()).toEqual(graph.nodes.map(n => n.id).sort());
  });
});

// ── getSiblings ──────────────────────────────────────────────────────────────

describe('getSiblings', () => {
  it('returns nodes sharing a common parent, excluding self', () => {
    const graph = diamondGraph();
    // impl-a and impl-b both depend on snapshot
    const siblings = getSiblings(graph, 'impl-a');
    expect(siblings).toContain('impl-b');
    expect(siblings).not.toContain('impl-a');
  });

  it('returns empty array when no siblings exist', () => {
    const graph = linearGraph();
    // write-tests is the only child of snapshot
    const siblings = getSiblings(graph, 'write-tests');
    expect(siblings).toEqual([]);
  });

  it('excludes ancestors from siblings', () => {
    const graph = diamondGraph();
    // snapshot is the parent, not a sibling
    const siblings = getSiblings(graph, 'impl-a');
    expect(siblings).not.toContain('snapshot');
  });

  it('returns empty array for root node with no parents', () => {
    const graph = linearGraph();
    const siblings = getSiblings(graph, 'snapshot');
    expect(siblings).toEqual([]);
  });

  it('works with diamond graphs — integration node siblings', () => {
    // Build a graph where two nodes share the same two parents
    const graph: Graph = {
      change: 'multi-parent',
      version: '1',
      created_at: '2026-03-26T00:00:00Z',
      nodes: [
        { id: 'root', type: 'deterministic', description: 'root', deps: [], inputs: [], outputs: [], scope: [], validate: [], command: 'echo' },
        { id: 'a', type: 'llm', description: 'a', agent: 'specwork-implementer', deps: ['root'], inputs: [], outputs: [], scope: [], validate: [] },
        { id: 'b', type: 'llm', description: 'b', agent: 'specwork-implementer', deps: ['root'], inputs: [], outputs: [], scope: [], validate: [] },
        { id: 'c', type: 'llm', description: 'c', agent: 'specwork-implementer', deps: ['root'], inputs: [], outputs: [], scope: [], validate: [] },
      ],
    };
    const siblings = getSiblings(graph, 'a');
    expect(siblings.sort()).toEqual(['b', 'c'].sort());
    expect(siblings).not.toContain('root');
  });

  it('does not return duplicates when sharing multiple parents', () => {
    const graph: Graph = {
      change: 'shared-parents',
      version: '1',
      created_at: '2026-03-26T00:00:00Z',
      nodes: [
        { id: 'p1', type: 'deterministic', description: 'p1', deps: [], inputs: [], outputs: [], scope: [], validate: [], command: 'echo' },
        { id: 'p2', type: 'deterministic', description: 'p2', deps: [], inputs: [], outputs: [], scope: [], validate: [], command: 'echo' },
        { id: 'child-a', type: 'llm', description: 'a', agent: 'specwork-implementer', deps: ['p1', 'p2'], inputs: [], outputs: [], scope: [], validate: [] },
        { id: 'child-b', type: 'llm', description: 'b', agent: 'specwork-implementer', deps: ['p1', 'p2'], inputs: [], outputs: [], scope: [], validate: [] },
      ],
    };
    const siblings = getSiblings(graph, 'child-a');
    // child-b shares both p1 and p2, but should appear only once
    expect(siblings).toEqual(['child-b']);
  });
});
