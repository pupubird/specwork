import { describe, it, expect } from 'vitest';
import { buildNextAction } from '../../core/next-action.js';

// ── These tests cover the simplified wave lifecycle:
//    start wave -> implement wave -> QA wave -> fix / next.

describe('wave QA after implementation', () => {
  const context = 'Add anti-deferral enforcement';
  const change = 'add-anti-deferral';

  it('wave:spawn description mentions the wave spawn (no verify/summarizer prose)', () => {
    const action = buildNextAction('wave:spawn', context, {
      change,
      readyNodes: ['impl-1-1'],
    });

    expect(action.command).toBe('team:spawn');
    expect(action.description).not.toMatch(/verify|summarizer/i);
  });

  it('affected nodes failed by wave QA retry through normal node failure handling', () => {
    const action = buildNextAction('node:fail', context, {
      change,
      nodeId: 'impl-1-1',
      retriesLeft: 2,
    });

    expect(action.command).toBe('subagent:respawn');
  });

  it('affected nodes failed by wave QA escalate when retries are exhausted', () => {
    const action = buildNextAction('node:fail', context, {
      change,
      nodeId: 'impl-1-1',
      retriesLeft: 0,
    });

    expect(action.command).toBe('escalate');
    expect(action.suggest_to_user).toBeDefined();
  });
});

describe('done flow after last node', () => {
  const context = 'Add anti-deferral enforcement';
  const change = 'add-anti-deferral';

  it('go:done returns normal done suggestions when no nodes remain', () => {
    const action = buildNextAction('go:done', context, { change });

    expect(action.command).toBe('suggest');
    expect(action.suggest_to_user).toBeDefined();
    expect(action.suggest_to_user!.some(s => /archive/i.test(s))).toBe(true);
  });
});
