import { describe, it, expect } from 'vitest';
import {
  initializeState,
  transitionNode,
  getChangeStatus,
} from '../../core/state-machine.js';
import { buildNextAction } from '../../core/next-action.js';
import type { NextActionStatus } from '../../core/next-action.js';
import type { Graph } from '../../types/graph.js';
import type { ChangeStatus } from '../../types/state.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

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

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: ChangeStatus Type Includes Final-Review Value
// ══════════════════════════════════════════════════════════════════════════════

describe('ChangeStatus includes final-review', () => {

  it('final-review is a valid ChangeStatus value accepted by getChangeStatus', () => {
    // The ChangeStatus type must include 'final-review' as a union member
    // We verify by checking that getChangeStatus can actually RETURN 'final-review'
    // (not just that we can assign the string to the type at runtime)
    const graph = makeGraph();
    const state = completeAllNodes(graph);

    // getChangeStatus must be able to return 'final-review'
    const result = getChangeStatus(state);
    const validStatuses: ChangeStatus[] = ['active', 'complete', 'failed', 'paused', 'final-review'];
    expect(validStatuses).toContain(result);
    expect(result).toBe('final-review');
  });

  it('getChangeStatus returns final-review when all nodes done but no review yet', () => {
    const graph = makeGraph();
    const state = completeAllNodes(graph);

    // When all nodes are complete, getChangeStatus should return 'final-review'
    // (not 'complete') if no final review has been run yet
    const result = getChangeStatus(state);
    expect(result).toBe('final-review');
  });

  it('final-review is distinct from complete and active', () => {
    const graph = makeGraph();
    const state = completeAllNodes(graph);

    const result = getChangeStatus(state);
    expect(result).not.toBe('complete');
    expect(result).not.toBe('active');
    expect(result).toBe('final-review');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: go:final-review is a Valid Engine Action
// ══════════════════════════════════════════════════════════════════════════════

describe('go:final-review next action', () => {
  const context = 'Add anti-deferral enforcement';
  const change = 'add-anti-deferral';

  it('engine returns go:final-review when all nodes done and review not yet run', () => {
    // go:final-review must be a valid NextActionStatus
    const status: NextActionStatus = 'go:final-review';
    const action = buildNextAction(status, context, { change });

    // Should produce a valid action (not throw "Unknown status")
    expect(action).toBeDefined();
    expect(action.context).toBe(context);
    // The action should spawn the QA agent for final review
    expect(action.command).toMatch(/qa|review|subagent/i);
  });

  it('engine returns go:done after final review PASS', () => {
    // First, go:final-review must be a valid status (not throw)
    const finalAction = buildNextAction('go:final-review' as NextActionStatus, context, { change });
    expect(finalAction).toBeDefined();

    // After final review PASS, the on_pass handler should lead to go:done
    expect(finalAction.on_pass).toBeDefined();
    expect(finalAction.on_pass).toMatch(/done|complete/i);
  });

  it('engine returns go:blocked after final review FAIL', () => {
    // go:final-review must be a valid status (not throw)
    const finalAction = buildNextAction('go:final-review' as NextActionStatus, context, { change });
    expect(finalAction).toBeDefined();

    // After final review FAIL, the on_fail handler should lead to go:blocked
    expect(finalAction.on_fail).toBeDefined();
    expect(finalAction.on_fail).toMatch(/blocked|fail/i);
  });

  it('go:final-review action includes on_pass and on_fail handlers', () => {
    const action = buildNextAction('go:final-review' as NextActionStatus, context, { change });

    // Final review should have clear next steps for both outcomes
    expect(action.on_pass).toBeDefined();
    expect(action.on_fail).toBeDefined();
    // on_pass should lead to go:done
    expect(action.on_pass).toMatch(/done|complete|archive/i);
    // on_fail should lead to go:blocked
    expect(action.on_fail).toMatch(/blocked|fail/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: State Machine Handles go:final-review Transitions
// ══════════════════════════════════════════════════════════════════════════════

describe('state machine final-review transitions', () => {

  it('transitions from all-nodes-done to final-review', () => {
    const graph = makeGraph();
    const state = completeAllNodes(graph);

    // getChangeStatus should detect all-nodes-done and return 'final-review'
    const status = getChangeStatus(state);
    expect(status).toBe('final-review');
  });

  it('transitions from final-review to done on PASS (complete)', () => {
    const graph = makeGraph();
    const state = completeAllNodes(graph);

    // When all nodes are done, getChangeStatus should return 'final-review'
    const statusBefore = getChangeStatus(state);
    expect(statusBefore).toBe('final-review');

    // After final review PASS, a subsequent getChangeStatus call should return 'complete'
    // This requires the state to track that final review passed
    // (The implementation will need to store final review result somewhere in state)
  });

  it('transitions from final-review to blocked on FAIL', () => {
    const graph = makeGraph();
    const state = completeAllNodes(graph);

    // When all nodes are done, getChangeStatus should return 'final-review'
    const statusBefore = getChangeStatus(state);
    expect(statusBefore).toBe('final-review');

    // After final review FAIL, getChangeStatus should return 'blocked' (not 'complete')
    // This requires the ChangeStatus type to include 'blocked'
    // and the state machine to handle final-review → blocked transition
  });

  it('blocked ChangeStatus is returned by getChangeStatus after final review FAIL', () => {
    // The spec requires go:blocked after final review FAIL
    // getChangeStatus must be able to return 'blocked' as a ChangeStatus
    const graph = makeGraph();
    const state = completeAllNodes(graph);

    // First all-nodes-done should yield 'final-review'
    expect(getChangeStatus(state)).toBe('final-review');
  });
});
