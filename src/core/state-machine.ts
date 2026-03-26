import type { Graph, GraphNode } from '../types/graph.js';
import type { WorkflowState, NodeState, NodeStatus, ChangeStatus } from '../types/state.js';
import { ForemanError } from '../utils/errors.js';
import { ExitCode } from '../types/index.js';

// Valid status transitions
const TRANSITIONS: Record<NodeStatus, NodeStatus[]> = {
  pending: ['in_progress', 'skipped'],
  in_progress: ['complete', 'failed', 'escalated', 'rejected'],
  failed: ['in_progress'], // retry
  escalated: ['in_progress'], // manual retry
  complete: [], // terminal
  rejected: [], // terminal
  skipped: [], // terminal
};

export function isTerminal(status: NodeStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

function now(): string {
  return new Date().toISOString();
}

function defaultNodeState(): NodeState {
  return {
    status: 'pending',
    started_at: null,
    completed_at: null,
    retries: 0,
    error: null,
    l0: null,
  };
}

export function initializeState(graph: Graph): WorkflowState {
  const nodes: Record<string, NodeState> = {};
  for (const node of graph.nodes) {
    nodes[node.id] = defaultNodeState();
  }
  const ts = now();
  return {
    change: graph.change,
    status: 'active',
    started_at: ts,
    updated_at: ts,
    lock: null,
    nodes,
  };
}

export function transitionNode(
  state: WorkflowState,
  nodeId: string,
  newStatus: NodeStatus,
  opts?: { error?: string; l0?: string }
): WorkflowState {
  const nodeState = state.nodes[nodeId];
  if (!nodeState) {
    throw new ForemanError(`Node "${nodeId}" not found in state`, ExitCode.ERROR);
  }

  const allowed = TRANSITIONS[nodeState.status];
  if (!allowed.includes(newStatus)) {
    throw new ForemanError(
      `Invalid transition for node "${nodeId}": ${nodeState.status} → ${newStatus}. Allowed: [${allowed.join(', ')}]`,
      ExitCode.ERROR
    );
  }

  const ts = now();
  const updatedNode: NodeState = {
    ...nodeState,
    status: newStatus,
    error: opts?.error ?? null,
    l0: opts?.l0 ?? nodeState.l0,
  };

  if (newStatus === 'in_progress') {
    updatedNode.started_at = ts;
    updatedNode.completed_at = null;
  } else if (isTerminal(newStatus)) {
    updatedNode.completed_at = ts;
  }

  return {
    ...state,
    updated_at: ts,
    nodes: { ...state.nodes, [nodeId]: updatedNode },
  };
}

export function incrementRetry(
  state: WorkflowState,
  nodeId: string,
  maxRetries: number
): { state: WorkflowState; exhausted: boolean } {
  const nodeState = state.nodes[nodeId];
  if (!nodeState) {
    throw new ForemanError(`Node "${nodeId}" not found in state`, ExitCode.ERROR);
  }

  const newRetries = nodeState.retries + 1;
  const exhausted = newRetries > maxRetries;

  const updatedNode: NodeState = { ...nodeState, retries: newRetries };
  const updatedState: WorkflowState = {
    ...state,
    updated_at: now(),
    nodes: { ...state.nodes, [nodeId]: updatedNode },
  };

  return { state: updatedState, exhausted };
}

export function skipDependents(
  state: WorkflowState,
  graph: Graph,
  nodeId: string
): WorkflowState {
  // Find all nodes that depend on nodeId (directly or transitively)
  const toSkip = new Set<string>();

  function collect(id: string): void {
    for (const node of graph.nodes) {
      if (node.deps.includes(id) && !toSkip.has(node.id)) {
        toSkip.add(node.id);
        collect(node.id);
      }
    }
  }

  collect(nodeId);

  let updated = state;
  const ts = now();

  for (const id of toSkip) {
    const ns = updated.nodes[id];
    if (!ns) continue;
    // Only skip nodes that are still pending (don't touch already-running or complete nodes)
    if (ns.status === 'pending') {
      updated = {
        ...updated,
        updated_at: ts,
        nodes: {
          ...updated.nodes,
          [id]: {
            ...ns,
            status: 'skipped',
            completed_at: ts,
            error: `Skipped because upstream node "${nodeId}" failed`,
          },
        },
      };
    }
  }

  return updated;
}

export function getChangeStatus(state: WorkflowState): ChangeStatus {
  const statuses = Object.values(state.nodes).map(n => n.status);

  if (statuses.some(s => s === 'failed' || s === 'escalated')) {
    return 'failed';
  }
  if (statuses.some(s => s === 'in_progress')) {
    return 'active';
  }
  if (statuses.every(s => isTerminal(s))) {
    // All terminal — complete if none rejected/failed, otherwise failed
    if (statuses.some(s => s === 'rejected')) {
      return 'failed';
    }
    return 'complete';
  }
  // Some pending
  return 'active';
}
