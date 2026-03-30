import { describe, it, expect } from 'vitest';
import {
  buildMermaidDiagram,
  extractProposalSummary,
  extractSpecRequirements,
  renderHTML,
} from '../../core/viz-renderer.js';
import type { Graph, GraphNode } from '../../types/graph.js';

// -- Fixtures ----------------------------------------------------------------

function makeNode(overrides: Partial<GraphNode> & { id: string }): GraphNode {
  return {
    type: 'deterministic',
    description: '',
    deps: [],
    inputs: [],
    outputs: [],
    scope: [],
    validate: [],
    ...overrides,
  };
}

function makeGraph(nodes: GraphNode[], change = 'test-change'): Graph {
  return {
    change,
    version: '1',
    created_at: '2026-03-30T00:00:00Z',
    nodes,
  };
}

// == buildMermaidDiagram =====================================================

describe('buildMermaidDiagram', () => {
  it('outputs Mermaid TD flowchart direction', () => {
    const graph = makeGraph([makeNode({ id: 'snapshot' })]);
    const diagram = buildMermaidDiagram(graph);
    expect(diagram).toContain('graph TD');
  });

  it('includes all node IDs in the output', () => {
    const graph = makeGraph([
      makeNode({ id: 'snapshot' }),
      makeNode({ id: 'write-tests', deps: ['snapshot'] }),
      makeNode({ id: 'impl-auth', deps: ['write-tests'] }),
    ]);
    const diagram = buildMermaidDiagram(graph);
    expect(diagram).toContain('snapshot');
    expect(diagram).toContain('write-tests');
    expect(diagram).toContain('impl-auth');
  });

  it('draws edges from deps', () => {
    const graph = makeGraph([
      makeNode({ id: 'snapshot' }),
      makeNode({ id: 'write-tests', deps: ['snapshot'] }),
      makeNode({ id: 'impl-auth', deps: ['write-tests'] }),
    ]);
    const diagram = buildMermaidDiagram(graph);
    expect(diagram).toContain('snapshot --> write-tests');
    expect(diagram).toContain('write-tests --> impl-auth');
  });

  it('applies distinct style for snapshot nodes (gray)', () => {
    const graph = makeGraph([
      makeNode({ id: 'snapshot', command: 'specwork snapshot' }),
    ]);
    const diagram = buildMermaidDiagram(graph);
    // Should contain style or class definition making snapshot gray
    expect(diagram).toMatch(/snapshot.*gray|style snapshot.*#[0-9a-fA-F]*|classDef.*snapshot/i);
  });

  it('applies distinct style for write-tests nodes (blue)', () => {
    const graph = makeGraph([
      makeNode({ id: 'write-tests', agent: 'specwork-test-writer' }),
    ]);
    const diagram = buildMermaidDiagram(graph);
    expect(diagram).toMatch(/write-tests.*blue|style write-tests.*#[0-9a-fA-F]*|classDef.*test/i);
  });

  it('applies distinct style for impl nodes (green)', () => {
    const graph = makeGraph([
      makeNode({ id: 'impl-auth', agent: 'specwork-implementer' }),
    ]);
    const diagram = buildMermaidDiagram(graph);
    expect(diagram).toMatch(/impl-auth.*green|style impl-auth.*#[0-9a-fA-F]*|classDef.*impl/i);
  });

  it('applies distinct style for integration nodes (purple)', () => {
    const graph = makeGraph([
      makeNode({ id: 'integration', agent: 'specwork-verifier' }),
    ]);
    const diagram = buildMermaidDiagram(graph);
    expect(diagram).toMatch(/integration.*purple|style integration.*#[0-9a-fA-F]*|classDef.*integration/i);
  });

  it('shows sub_tasks badge for group nodes', () => {
    const graph = makeGraph([
      makeNode({
        id: 'impl-auth',
        group: 'auth',
        sub_tasks: ['Create auth service', 'Add middleware', 'Write tests'],
      }),
    ]);
    const diagram = buildMermaidDiagram(graph);
    // Should show a count indicator like "(3 tasks)" or badge
    expect(diagram).toMatch(/impl-auth.*3|3 tasks|3 sub/i);
  });

  it('handles nodes with multiple deps', () => {
    const graph = makeGraph([
      makeNode({ id: 'a' }),
      makeNode({ id: 'b' }),
      makeNode({ id: 'c', deps: ['a', 'b'] }),
    ]);
    const diagram = buildMermaidDiagram(graph);
    expect(diagram).toContain('a --> c');
    expect(diagram).toContain('b --> c');
  });

  it('handles empty graph with no nodes', () => {
    const graph = makeGraph([]);
    const diagram = buildMermaidDiagram(graph);
    expect(diagram).toContain('graph TD');
  });
});

// == extractProposalSummary ==================================================

describe('extractProposalSummary', () => {
  it('extracts text under ## Why heading', () => {
    const content = `# Proposal

## Why

We need JWT authentication to secure the API endpoints.

## What

Add JWT tokens.
`;
    const summary = extractProposalSummary(content);
    expect(summary).toContain('We need JWT authentication to secure the API endpoints.');
  });

  it('returns empty string when ## Why section is missing', () => {
    const content = `# Proposal

## What

Some content here.
`;
    const summary = extractProposalSummary(content);
    expect(summary).toBe('');
  });

  it('stops extraction at the next ## heading', () => {
    const content = `## Why

First paragraph.

Second paragraph.

## What

Should not be included.
`;
    const summary = extractProposalSummary(content);
    expect(summary).toContain('First paragraph.');
    expect(summary).toContain('Second paragraph.');
    expect(summary).not.toContain('Should not be included.');
  });

  it('handles ## Why as last section', () => {
    const content = `## What

Something.

## Why

This is the reason and there is nothing after it.
`;
    const summary = extractProposalSummary(content);
    expect(summary).toContain('This is the reason and there is nothing after it.');
  });
});

// == extractSpecRequirements =================================================

describe('extractSpecRequirements', () => {
  it('extracts ### Requirement headers from spec content', () => {
    const specFiles = [
      {
        name: 'auth.spec.md',
        content: `### Requirement: Token Validation
Some detail.

### Requirement: Token Refresh
More detail.
`,
      },
    ];
    const result = extractSpecRequirements(specFiles);
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe('auth.spec.md');
    expect(result[0].requirements).toContain('Token Validation');
    expect(result[0].requirements).toContain('Token Refresh');
  });

  it('groups requirements by file', () => {
    const specFiles = [
      {
        name: 'auth.spec.md',
        content: `### Requirement: Token Validation`,
      },
      {
        name: 'api.spec.md',
        content: `### Requirement: Rate Limiting\n### Requirement: CORS Headers`,
      },
    ];
    const result = extractSpecRequirements(specFiles);
    expect(result).toHaveLength(2);

    const authFile = result.find(r => r.file === 'auth.spec.md');
    const apiFile = result.find(r => r.file === 'api.spec.md');

    expect(authFile!.requirements).toEqual(['Token Validation']);
    expect(apiFile!.requirements).toEqual(['Rate Limiting', 'CORS Headers']);
  });

  it('returns empty array for files with no requirements', () => {
    const specFiles = [
      {
        name: 'empty.spec.md',
        content: `# Just a heading\n\nSome prose without requirements.`,
      },
    ];
    const result = extractSpecRequirements(specFiles);
    // Either empty array or entry with empty requirements
    const entry = result.find(r => r.file === 'empty.spec.md');
    if (entry) {
      expect(entry.requirements).toHaveLength(0);
    } else {
      expect(result).toHaveLength(0);
    }
  });

  it('handles empty input array', () => {
    const result = extractSpecRequirements([]);
    expect(result).toEqual([]);
  });
});

// == renderHTML ===============================================================

describe('renderHTML', () => {
  const minimalData = {
    graph: makeGraph([
      makeNode({ id: 'snapshot', command: 'specwork snapshot' }),
      makeNode({ id: 'write-tests', deps: ['snapshot'], agent: 'specwork-test-writer' }),
    ]),
    proposalSummary: 'We need this feature for security.',
    specRequirements: [
      { file: 'auth.spec.md', requirements: ['Token Validation', 'Token Refresh'] },
    ],
  };

  it('produces a string containing <!DOCTYPE html> or <html>', () => {
    const html = renderHTML(minimalData);
    expect(html).toMatch(/<(!DOCTYPE )?html/i);
  });

  it('includes Mermaid CDN script tag', () => {
    const html = renderHTML(minimalData);
    expect(html).toMatch(/mermaid/i);
    expect(html).toMatch(/<script.*src=.*cdn.*mermaid/i);
  });

  it('contains proposal panel with summary text', () => {
    const html = renderHTML(minimalData);
    expect(html).toContain('We need this feature for security.');
  });

  it('contains change name in header', () => {
    const html = renderHTML(minimalData);
    expect(html).toContain('test-change');
  });

  it('contains spec requirements summary', () => {
    const html = renderHTML(minimalData);
    expect(html).toContain('Token Validation');
    expect(html).toContain('Token Refresh');
    expect(html).toContain('auth.spec.md');
  });

  it('contains Mermaid diagram block with graph nodes', () => {
    const html = renderHTML(minimalData);
    // Should contain the mermaid diagram div and node references
    expect(html).toMatch(/class="mermaid"|<div.*mermaid/i);
    expect(html).toContain('snapshot');
    expect(html).toContain('write-tests');
  });

  it('contains node detail sections with type and deps', () => {
    const html = renderHTML(minimalData);
    // Node detail should reference the node type or agent
    expect(html).toContain('specwork-test-writer');
  });

  it('is self-contained — no external CSS links', () => {
    const html = renderHTML(minimalData);
    // Should not have external stylesheet links (CDN scripts are okay)
    const cssLinkMatches = html.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi) || [];
    expect(cssLinkMatches).toHaveLength(0);
  });

  it('includes inline CSS', () => {
    const html = renderHTML(minimalData);
    expect(html).toMatch(/<style[^>]*>[\s\S]+<\/style>/);
  });

  it('handles optional state data', () => {
    const dataWithState = {
      ...minimalData,
      state: { nodes: { snapshot: { status: 'complete' } } },
    };
    const html = renderHTML(dataWithState);
    expect(html).toBeDefined();
    expect(typeof html).toBe('string');
  });
});
