import { describe, it, expect } from 'vitest';
import { buildNextAction } from '../../core/next-action.js';
import type { NextAction } from '../../types/state.js';

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Exact Commands in next_action
// ══════════════════════════════════════════════════════════════════════════════

describe('exact commands in next_action', () => {
  const context = 'Execution model overhaul';
  const change = 'exec-model-v2';

  it('go:ready returns ready_queue array with all ready node IDs', () => {
    // Spec: response SHALL include ready_queue array containing all ready node IDs
    const action = buildNextAction('go:ready', context, {
      change,
      readyNodes: ['impl-1', 'impl-2', 'impl-3'],
    });

    // ready_queue is a NEW field on NextAction (doesn't exist yet)
    expect((action as any).ready_queue).toBeDefined();
    expect((action as any).ready_queue).toEqual(['impl-1', 'impl-2', 'impl-3']);
  });

  it('node:complete includes wave number in response', () => {
    // Spec: node:complete response contains exact next command
    // The new behavior should include wave tracking context
    const action = buildNextAction('node:complete', context, {
      change,
      nodeId: 'impl-1',
    });

    // New requirement: the action should carry current_wave info
    expect((action as any).current_wave).toBeDefined();
    expect(typeof (action as any).current_wave).toBe('number');
  });

  it('node:verify:pass on_pass includes --json flag for complete', () => {
    // Spec: on_pass SHALL be complete command with --json for machine parsing
    const action = buildNextAction('node:verify:pass', context, {
      change,
      nodeId: 'impl-1',
    });

    // New requirement: complete command needs --json for deterministic parsing
    expect(action.on_pass).toBe(`specwork node complete ${change} impl-1 --json`);
  });

  it('node:start command field is exact specwork node start CLI command', () => {
    // Spec: command SHALL be exact CLI string, not symbolic
    const action = buildNextAction('node:start', context, {
      change,
      nodeId: 'impl-1',
    });

    // New requirement: command should be an exact CLI string, not 'subagent:spawn'
    expect(action.command).toBe(`specwork node start ${change} impl-1 --json`);
  });

  it('node:start on_fail has no angle-bracket placeholders', () => {
    // Spec: on_fail SHALL be executable as-is — no <error> placeholder
    const action = buildNextAction('node:start', context, {
      change,
      nodeId: 'impl-1',
    });

    expect(action.on_fail).toBeDefined();
    // Current impl has '<error>' placeholder — this MUST fail
    expect(action.on_fail).not.toMatch(/<[^>]+>/);
  });

  it('node:verify:fail on_fail has no angle-bracket placeholders', () => {
    // Spec: on_fail SHALL be executable as-is — no <failed checks> placeholder
    const action = buildNextAction('node:verify:fail', context, {
      change,
      nodeId: 'impl-1',
    });

    expect(action.on_fail).toBeDefined();
    // Current impl has '<failed checks>' placeholder — this MUST fail
    expect(action.on_fail).not.toMatch(/<[^>]+>/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: No Prose in command Field
// ══════════════════════════════════════════════════════════════════════════════

describe('no prose in command field', () => {
  const context = 'Execution model overhaul';
  const change = 'exec-model-v2';

  // Allowed: exact CLI commands or defined symbolic actions ONLY
  const allowedSymbolicActions = ['team:spawn', 'wait', 'escalate', 'suggest'];

  it('node:fail with retries exhausted uses symbolic escalate (not CLI command)', () => {
    // Spec: command must be symbolic 'escalate' or an exact CLI command
    // Current impl returns `specwork node escalate ...` which is a CLI command
    // Per spec, the symbolic action set is: team:spawn, wait, escalate, suggest
    const action = buildNextAction('node:fail', context, {
      change,
      nodeId: 'impl-1',
      retriesLeft: 0,
    });

    const isSymbolic = allowedSymbolicActions.includes(action.command);
    const isCLI = action.command.startsWith('specwork ');

    // The escalate command should be the symbolic 'escalate', not a specwork CLI command
    expect(isSymbolic).toBe(true);
  });

  it('node:verify:fail uses symbolic action or exact CLI (not template)', () => {
    // Current impl uses a template with <failed checks>
    const action = buildNextAction('node:verify:fail', context, {
      change,
      nodeId: 'impl-1',
    });

    // command should be clean — no angle-bracket placeholders
    expect(action.command).not.toMatch(/<[^>]+>/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: ready_queue on NextAction type
// ══════════════════════════════════════════════════════════════════════════════

describe('ready_queue on NextAction', () => {
  it('NextAction type includes ready_queue field', () => {
    // Spec: go:ready response SHALL include ready_queue array
    // This tests the TypeScript type includes the field
    type HasReadyQueue = NextAction extends { ready_queue?: string[] } ? true : false;
    const check: HasReadyQueue = true;
    expect(check).toBe(true);

    // Runtime check: buildNextAction for go:ready should populate it
    const action = buildNextAction('go:ready', '', {
      change: 'test',
      readyNodes: ['a', 'b'],
    });
    expect((action as NextAction).ready_queue).toEqual(['a', 'b']);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Unknown status handling
// ══════════════════════════════════════════════════════════════════════════════

describe('unknown status handling', () => {
  it('unknown status throws an error', () => {
    // Spec: unknown status → agent SHALL escalate, SHALL NOT guess
    // buildNextAction should throw for unrecognized statuses
    expect(() => {
      buildNextAction('unknown:xyz' as any, '', { change: 'test' });
    }).toThrow();
  });
});
