import { describe, it, expect } from 'vitest';
import type { GraphNode } from '../../types/graph.js';
import type { WorkflowState } from '../../types/state.js';
import * as graphWalker from '../../core/graph-walker.js';
import * as contextAssembler from '../../core/context-assembler.js';
import { initializeState } from '../../core/state-machine.js';

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: GraphNode Group Fields
// ══════════════════════════════════════════════════════════════════════════════

describe('GraphNode group fields', () => {
  it('initializeState preserves group field from graph nodes', () => {
    // Spec: GraphNode SHALL support optional "group" field
    // Test that the engine recognizes group on nodes by checking
    // that initializeState can process a graph where nodes have group
    const graph = {
      change: 'test',
      version: '1',
      created_at: '2026-03-30T00:00:00Z',
      nodes: [
        {
          id: 'impl-1',
          type: 'llm' as const,
          description: 'Type system changes',
          agent: 'specwork-implementer',
          deps: [],
          inputs: [],
          outputs: [],
          scope: ['src/types/'],
          validate: [],
          group: 'type-system',
          sub_tasks: ['Add config types', 'Add graph types', 'Add state types'],
        },
      ],
    };

    const state = initializeState(graph);
    // The state should track the group info for the node
    expect((state.nodes['impl-1'] as any).group).toBe('type-system');
  });

  it('initializeState tracks sub_tasks in node state', () => {
    // Spec: GraphNode SHALL support optional "sub_tasks" field
    const graph = {
      change: 'test',
      version: '1',
      created_at: '2026-03-30T00:00:00Z',
      nodes: [
        {
          id: 'impl-1',
          type: 'llm' as const,
          description: 'Type system changes',
          agent: 'specwork-implementer',
          deps: [],
          inputs: [],
          outputs: [],
          scope: ['src/types/'],
          validate: [],
          sub_tasks: ['Task A', 'Task B', 'Task C'],
        },
      ],
    };

    const state = initializeState(graph);
    // NodeState should have sub_tasks info to track completion of each
    expect((state.nodes['impl-1'] as any).sub_tasks_completed).toBeDefined();
    expect((state.nodes['impl-1'] as any).sub_tasks_completed).toEqual([false, false, false]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Per-Group Verification
// ══════════════════════════════════════════════════════════════════════════════

describe('per-group verification', () => {
  it('isGroupNode is exported from graph-walker', () => {
    // New helper to check if a node is a group node
    expect(graphWalker).toHaveProperty('isGroupNode');
    expect(typeof (graphWalker as any).isGroupNode).toBe('function');
  });

  it('isGroupNode returns true for node with sub_tasks', () => {
    const isGroupNode = (graphWalker as any).isGroupNode;
    const node = {
      id: 'impl-1',
      type: 'llm',
      group: 'type-system',
      sub_tasks: ['Task A', 'Task B'],
    };
    expect(isGroupNode(node)).toBe(true);
  });

  it('isGroupNode returns false for node without sub_tasks', () => {
    const isGroupNode = (graphWalker as any).isGroupNode;
    const node = {
      id: 'impl-2',
      type: 'llm',
    };
    expect(isGroupNode(node)).toBe(false);
  });

  it('isGroupNode returns false for node with group: null (opt-out)', () => {
    const isGroupNode = (graphWalker as any).isGroupNode;
    const node = {
      id: 'impl-3',
      type: 'llm',
      group: null,
    };
    expect(isGroupNode(node)).toBe(false);
  });

  it('getVerificationScope is exported from graph-walker', () => {
    expect(graphWalker).toHaveProperty('getVerificationScope');
    expect(typeof (graphWalker as any).getVerificationScope).toBe('function');
  });

  it('group retry retries all sub-tasks (getRetryContext)', () => {
    // Spec: retry re-spawns entire group agent with all sub-tasks
    expect(graphWalker).toHaveProperty('getRetryContext');
    expect(typeof (graphWalker as any).getRetryContext).toBe('function');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Per-Group Summarization
// ══════════════════════════════════════════════════════════════════════════════

describe('per-group summarization', () => {
  it('getParentL1Sources is exported from context-assembler', () => {
    // New helper to get L1 sources for a node's parents
    expect(contextAssembler).toHaveProperty('getParentL1Sources');
    expect(typeof (contextAssembler as any).getParentL1Sources).toBe('function');
  });

  it('downstream gets unified L1 for group parent (not per-sub-task)', () => {
    // Spec: downstream node receives group's unified L1
    const getParentL1Sources = (contextAssembler as any).getParentL1Sources;

    const graph = {
      change: 'test',
      version: '1',
      created_at: '2026-03-30T00:00:00Z',
      nodes: [
        {
          id: 'impl-1',
          type: 'llm',
          group: 'type-system',
          sub_tasks: ['Task A', 'Task B', 'Task C'],
          deps: ['write-tests'],
          inputs: [],
          outputs: [],
          scope: ['src/types/'],
          validate: [],
          description: 'group node',
        },
        {
          id: 'impl-2',
          type: 'llm',
          deps: ['impl-1'],
          inputs: [],
          outputs: [],
          scope: [],
          validate: [],
          description: 'downstream',
        },
      ],
    };

    const l1Sources = getParentL1Sources(graph, 'impl-2');
    // Should be exactly 1 L1 source, not 3 (one per sub-task)
    const groupL1Sources = l1Sources.filter((s: any) => s.nodeId === 'impl-1');
    expect(groupL1Sources).toHaveLength(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Combined Scope for Group Nodes
// ══════════════════════════════════════════════════════════════════════════════

describe('combined scope for group nodes', () => {
  it('getVerificationScope returns combined scope for group node', () => {
    const getVerificationScope = (graphWalker as any).getVerificationScope;

    const graph = {
      change: 'test',
      version: '1',
      created_at: '2026-03-30T00:00:00Z',
      nodes: [
        {
          id: 'impl-1',
          type: 'llm',
          group: 'type-system',
          sub_tasks: ['Task A', 'Task B', 'Task C'],
          deps: [],
          inputs: [],
          outputs: [],
          scope: ['src/types/config.ts', 'src/types/graph.ts', 'src/types/state.ts'],
          validate: [],
          description: 'group node',
        },
      ],
    };

    const scope = getVerificationScope(graph, 'impl-1');
    expect(scope).toContain('src/types/config.ts');
    expect(scope).toContain('src/types/graph.ts');
    expect(scope).toContain('src/types/state.ts');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Group Opt-Out
// ══════════════════════════════════════════════════════════════════════════════

describe('group opt-out', () => {
  it('node with group: null is not a group node', () => {
    const isGroupNode = (graphWalker as any).isGroupNode;
    const node = { id: 'x', group: null, sub_tasks: undefined };
    expect(isGroupNode(node)).toBe(false);
  });
});
