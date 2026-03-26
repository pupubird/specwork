import type { Graph, GraphNode } from '../types/graph.js';
import type { WorkflowState } from '../types/state.js';
import { NodeNotFoundError } from '../utils/errors.js';

export function getNode(graph: Graph, nodeId: string): GraphNode | undefined {
  return graph.nodes.find(n => n.id === nodeId);
}

export function getReadyNodes(graph: Graph, state: WorkflowState): GraphNode[] {
  return graph.nodes.filter(node => {
    const nodeState = state.nodes[node.id];
    if (!nodeState || nodeState.status !== 'pending') return false;

    // All deps must be complete
    return node.deps.every(depId => {
      const depState = state.nodes[depId];
      return depState?.status === 'complete';
    });
  });
}

export function getBlockedNodes(graph: Graph, state: WorkflowState): GraphNode[] {
  return graph.nodes.filter(node => {
    const nodeState = state.nodes[node.id];
    if (!nodeState || nodeState.status !== 'pending') return false;

    // At least one dep is not complete (and not itself pending)
    return node.deps.some(depId => {
      const depState = state.nodes[depId];
      return depState?.status !== 'complete';
    });
  });
}

export function getParents(graph: Graph, nodeId: string): string[] {
  const node = graph.nodes.find(n => n.id === nodeId);
  if (!node) throw new NodeNotFoundError(nodeId);
  return [...node.deps];
}

export function getDescendants(graph: Graph, nodeId: string): string[] {
  const result = new Set<string>();

  function visit(id: string): void {
    for (const node of graph.nodes) {
      if (node.deps.includes(id) && !result.has(node.id)) {
        result.add(node.id);
        visit(node.id);
      }
    }
  }

  visit(nodeId);
  return [...result];
}

export function detectCycles(graph: Graph): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  // Build adjacency map for quick lookup
  const adj = new Map<string, string[]>();
  for (const node of graph.nodes) {
    adj.set(node.id, node.deps);
  }

  function dfs(nodeId: string): void {
    if (inStack.has(nodeId)) {
      // Found a cycle — capture the cycle portion of the path
      const cycleStart = path.indexOf(nodeId);
      cycles.push([...path.slice(cycleStart), nodeId]);
      return;
    }
    if (visited.has(nodeId)) return;

    visited.add(nodeId);
    inStack.add(nodeId);
    path.push(nodeId);

    const deps = adj.get(nodeId) ?? [];
    for (const dep of deps) {
      dfs(dep);
    }

    path.pop();
    inStack.delete(nodeId);
  }

  for (const node of graph.nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  }

  return cycles;
}

export function topologicalSort(graph: Graph): string[] {
  const cycles = detectCycles(graph);
  if (cycles.length > 0) {
    throw new Error(
      `Graph has cycles: ${cycles.map(c => c.join(' → ')).join('; ')}`
    );
  }

  const visited = new Set<string>();
  const result: string[] = [];

  // Build adjacency map (node → its deps)
  const nodeMap = new Map<string, GraphNode>();
  for (const node of graph.nodes) {
    nodeMap.set(node.id, node);
  }

  function visit(nodeId: string): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = nodeMap.get(nodeId);
    if (!node) throw new NodeNotFoundError(nodeId);

    // Visit deps first
    for (const dep of node.deps) {
      visit(dep);
    }

    result.push(nodeId);
  }

  for (const node of graph.nodes) {
    visit(node.id);
  }

  return result;
}
