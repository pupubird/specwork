import { describe, it, expect } from 'vitest';
import { validateGraph } from '../../core/graph-validator.js';
import type { Graph, GraphNode } from '../../types/graph.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<GraphNode> & { id: string; type: GraphNode['type'] }): GraphNode {
  return {
    description: `Node ${overrides.id}`,
    deps: [],
    inputs: [],
    outputs: [],
    scope: overrides.type === 'llm' ? ['src/'] : [],
    validate: [{ type: 'tsc-check' }],
    ...overrides,
    // type-specific defaults
    ...(overrides.type === 'deterministic' && !overrides.command ? { command: 'echo ok' } : {}),
    ...(overrides.type === 'llm' && !overrides.agent ? { agent: 'specwork-implementer' } : {}),
  };
}

function validGraph(): Graph {
  return {
    change: 'test-change',
    version: '1',
    created_at: '2026-03-26T00:00:00Z',
    nodes: [
      makeNode({ id: 'snapshot', type: 'deterministic', command: 'specwork snapshot' }),
      makeNode({ id: 'write-tests', type: 'llm', agent: 'specwork-test-writer', deps: ['snapshot'], scope: ['src/__tests__/'] }),
      makeNode({ id: 'impl-core', type: 'llm', agent: 'specwork-implementer', deps: ['write-tests'], scope: ['src/core/'] }),
      makeNode({ id: 'integration', type: 'deterministic', command: 'npm test', deps: ['impl-core'] }),
    ],
  };
}

// ── Valid graph ───────────────────────────────────────────────────────────────

describe('validateGraph — valid graph', () => {
  it('returns valid: true with no errors', () => {
    const result = validateGraph(validGraph());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ── Cycle detection ───────────────────────────────────────────────────────────

describe('validateGraph — cycle detection', () => {
  it('fails when graph has a cycle', () => {
    const g: Graph = {
      change: 'cyclic',
      version: '1',
      created_at: '2026-03-26T00:00:00Z',
      nodes: [
        makeNode({ id: 'a', type: 'deterministic', command: 'echo', deps: ['c'] }),
        makeNode({ id: 'b', type: 'deterministic', command: 'echo', deps: ['a'] }),
        makeNode({ id: 'c', type: 'deterministic', command: 'echo', deps: ['b'] }),
      ],
    };

    const result = validateGraph(g);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Cycle'))).toBe(true);
  });
});

// ── Duplicate IDs ─────────────────────────────────────────────────────────────

describe('validateGraph — duplicate IDs', () => {
  it('fails when two nodes share an ID', () => {
    const g = validGraph();
    g.nodes.push(makeNode({ id: 'snapshot', type: 'deterministic', command: 'echo' }));

    const result = validateGraph(g);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Duplicate') && e.includes('snapshot'))).toBe(true);
  });
});

// ── Missing dep references ────────────────────────────────────────────────────

describe('validateGraph — missing dep references', () => {
  it('fails when a dep references a nonexistent node', () => {
    const g = validGraph();
    g.nodes[1].deps = ['nonexistent'];

    const result = validateGraph(g);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('nonexistent'))).toBe(true);
  });
});

// ── Required fields per node type ─────────────────────────────────────────────

describe('validateGraph — required fields', () => {
  it('fails when deterministic node has no command', () => {
    const g: Graph = {
      change: 'test',
      version: '1',
      created_at: '2026-03-26T00:00:00Z',
      nodes: [
        {
          id: 'snap',
          type: 'deterministic',
          description: 'snap',
          deps: [],
          inputs: [],
          outputs: [],
          scope: [],
          validate: [{ type: 'tsc-check' }],
          // no command
        },
      ],
    };

    const result = validateGraph(g);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('command'))).toBe(true);
  });

  it('fails when llm node has no agent', () => {
    const g: Graph = {
      change: 'test',
      version: '1',
      created_at: '2026-03-26T00:00:00Z',
      nodes: [
        {
          id: 'impl',
          type: 'llm',
          description: 'impl',
          deps: [],
          inputs: [],
          outputs: [],
          scope: ['src/'],
          validate: [{ type: 'tsc-check' }],
          // no agent
        },
      ],
    };

    const result = validateGraph(g);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('agent'))).toBe(true);
  });

  it('fails when llm node has empty scope', () => {
    const g: Graph = {
      change: 'test',
      version: '1',
      created_at: '2026-03-26T00:00:00Z',
      nodes: [
        {
          id: 'impl',
          type: 'llm',
          description: 'impl',
          agent: 'specwork-implementer',
          deps: [],
          inputs: [],
          outputs: [],
          scope: [], // empty scope
          validate: [{ type: 'tsc-check' }],
        },
      ],
    };

    const result = validateGraph(g);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('scope'))).toBe(true);
  });

  it('fails when human node has no description', () => {
    const g: Graph = {
      change: 'test',
      version: '1',
      created_at: '2026-03-26T00:00:00Z',
      nodes: [
        {
          id: 'gate',
          type: 'human',
          description: '', // empty description
          deps: [],
          inputs: [],
          outputs: [],
          scope: [],
          validate: [{ type: 'tsc-check' }],
        },
      ],
    };

    const result = validateGraph(g);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('description'))).toBe(true);
  });
});

// ── Warnings: no validation rules ─────────────────────────────────────────────

describe('validateGraph — warnings', () => {
  it('warns when a node has no validation rules', () => {
    const g = validGraph();
    g.nodes[0].validate = []; // clear snapshot's validate

    const result = validateGraph(g);
    expect(result.warnings.some(w => w.includes('snapshot') && w.includes('validation rules'))).toBe(true);
  });

  it('does not emit warnings for nodes that have rules', () => {
    const result = validateGraph(validGraph());
    // All nodes in validGraph have validate rules, so no warnings about missing rules
    const noRuleWarnings = result.warnings.filter(w => w.includes('validation rules'));
    expect(noRuleWarnings).toHaveLength(0);
  });
});
