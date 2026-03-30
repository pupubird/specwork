import { describe, it, expect } from 'vitest';
import { buildNextAction } from '../../core/next-action.js';
import type { NextActionStatus } from '../../core/next-action.js';

// ── These tests cover the per-node QA workflow integration
//    After verify PASS, the engine should spawn QA before summarizer
//    This requires changes to buildNextAction for node:verify:pass
//    and new statuses: node:qa:pass and node:qa:fail

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: QA Agent Runs After Every Node Verify PASS
// ══════════════════════════════════════════════════════════════════════════════

describe('per-node QA after verify PASS', () => {
  const context = 'Add anti-deferral enforcement';
  const change = 'add-anti-deferral';

  // ── Scenario: QA runs after verify PASS ───────────────────────────────────

  it('after verify PASS, next action spawns QA agent (not summarizer directly)', () => {
    const action = buildNextAction('node:verify:pass', context, {
      change,
      nodeId: 'impl-1-1',
    });

    // Current behavior: spawns summarizer directly
    // New behavior: should spawn QA agent first
    expect(action.command).toMatch(/qa|specwork-qa/i);
    // The action should NOT directly reference summarizer
    expect(action.description).not.toMatch(/summarizer/i);
  });

  it('verify PASS action includes on_pass leading to QA', () => {
    const action = buildNextAction('node:verify:pass', context, {
      change,
      nodeId: 'impl-1-1',
    });

    // on_pass should lead to QA, not directly to node complete
    expect(action.on_pass).toBeDefined();
    expect(action.on_pass).toMatch(/qa/i);
  });

  // ── Scenario: QA PASS allows summarizer to proceed ────────────────────────

  it('node:qa:pass is a valid status that leads to summarizer', () => {
    // node:qa:pass is a new status that must be handled
    const action = buildNextAction('node:qa:pass' as NextActionStatus, context, {
      change,
      nodeId: 'impl-1-1',
    });

    // After QA passes, the summarizer should be spawned
    expect(action).toBeDefined();
    expect(action.command).toMatch(/subagent|summarizer/i);
    expect(action.on_pass).toBeDefined();
    expect(action.on_pass).toMatch(/specwork node complete/);
    expect(action.on_pass).toMatch(/impl-1-1/);
  });

  // ── Scenario: QA FAIL triggers node retry ─────────────────────────────────

  it('node:qa:fail is a valid status that triggers node failure', () => {
    // node:qa:fail is a new status that must be handled
    const action = buildNextAction('node:qa:fail' as NextActionStatus, context, {
      change,
      nodeId: 'impl-1-1',
    });

    // After QA fails, the node should be treated as failed
    expect(action).toBeDefined();
    expect(action.on_fail).toBeDefined();
    expect(action.on_fail).toMatch(/specwork node fail/);
    expect(action.on_fail).toMatch(/impl-1-1/);
  });

  it('QA FAIL with retries remaining triggers respawn', () => {
    const action = buildNextAction('node:qa:fail' as NextActionStatus, context, {
      change,
      nodeId: 'impl-1-1',
      retriesLeft: 2,
    });

    // Should trigger retry, not escalation
    expect(action.command).toMatch(/fail|retry|respawn/i);
  });

  it('QA FAIL with retries exhausted triggers escalation', () => {
    const action = buildNextAction('node:qa:fail' as NextActionStatus, context, {
      change,
      nodeId: 'impl-1-1',
      retriesLeft: 0,
    });

    // Should escalate, not retry
    expect(action.command).toMatch(/escalate|fail/i);
    expect(action.suggest_to_user).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Final Review Session Evaluates Complete Change
// ══════════════════════════════════════════════════════════════════════════════

describe('final review session', () => {
  const context = 'Add anti-deferral enforcement';
  const change = 'add-anti-deferral';

  // ── Scenario: Final review fires automatically after last node completes ──

  it('go:final-review action is returned when all nodes complete', () => {
    // go:final-review must be recognized and produce a valid action
    const action = buildNextAction('go:final-review' as NextActionStatus, context, {
      change,
    });

    expect(action).toBeDefined();
    expect(action.context).toBe(context);
    // Should spawn QA for the full change
    expect(action.command).toMatch(/qa|review|subagent/i);
  });

  // ── Scenario: Final review PASS transitions to done ───────────────────────

  it('final review PASS leads to go:done', () => {
    const action = buildNextAction('go:final-review' as NextActionStatus, context, {
      change,
    });

    // on_pass should transition the change to done
    expect(action.on_pass).toBeDefined();
    expect(action.on_pass).toMatch(/done|complete|archive/i);
  });

  // ── Scenario: Final review FAIL blocks the change ─────────────────────────

  it('final review FAIL leads to go:blocked', () => {
    const action = buildNextAction('go:final-review' as NextActionStatus, context, {
      change,
    });

    // on_fail should block the change (not auto-retry)
    expect(action.on_fail).toBeDefined();
    expect(action.on_fail).toMatch(/blocked|fail/i);
  });

  it('final review FAIL does not trigger auto-retry', () => {
    const action = buildNextAction('go:final-review' as NextActionStatus, context, {
      change,
    });

    // Final review failure should NOT be retried automatically
    // It should escalate to the user
    expect(action.command).not.toMatch(/retry|respawn/i);
  });
});
