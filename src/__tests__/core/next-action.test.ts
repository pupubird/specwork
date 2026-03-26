import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stringify as stringifyYaml } from 'yaml';

// ── These tests cover buildNextAction() and readChangeContext()
//    which will be created in src/core/next-action.ts

import { buildNextAction, readChangeContext } from '../../core/next-action.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-next-action-'));
  return dir;
}

function rmTempRoot(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ══════════════════════════════════════════════════════════════════════════════
// readChangeContext
// ══════════════════════════════════════════════════════════════════════════════

describe('readChangeContext', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempRoot();
  });

  afterEach(() => {
    rmTempRoot(root);
  });

  it('reads description from .specwork.yaml', () => {
    const changeDir = path.join(root, '.specwork', 'changes', 'my-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(
      path.join(changeDir, '.specwork.yaml'),
      stringifyYaml({
        schema: 'specwork-change/v1',
        change: 'my-change',
        description: 'Add JWT authentication to the API',
        status: 'planning',
      }),
      'utf-8'
    );

    const ctx = readChangeContext(root, 'my-change');
    expect(ctx).toBe('Add JWT authentication to the API');
  });

  it('returns empty string when .specwork.yaml is missing', () => {
    const ctx = readChangeContext(root, 'nonexistent-change');
    expect(ctx).toBe('');
  });

  it('returns empty string when description field is absent', () => {
    const changeDir = path.join(root, '.specwork', 'changes', 'my-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(
      path.join(changeDir, '.specwork.yaml'),
      stringifyYaml({ schema: 'specwork-change/v1', change: 'my-change' }),
      'utf-8'
    );

    const ctx = readChangeContext(root, 'my-change');
    expect(ctx).toBe('');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// buildNextAction
// ══════════════════════════════════════════════════════════════════════════════

describe('buildNextAction', () => {
  const context = 'Add JWT authentication to the API';
  const change = 'add-jwt-auth';

  // ── specwork go statuses ─────────────────────────────────────────────────

  it('returns team:spawn action for go/ready status', () => {
    const action = buildNextAction('go:ready', context, {
      change,
      readyNodes: ['impl-1-1', 'impl-1-2'],
    });

    expect(action.command).toBe('team:spawn');
    expect(action.context).toBe(context);
    expect(action.description).toMatch(/team/i);
    expect(action.description).toMatch(/teammate/i);
  });

  it('returns suggest action for go/done status', () => {
    const action = buildNextAction('go:done', context, { change });

    expect(action.command).toBe('suggest');
    expect(action.context).toBe(context);
    expect(action.suggest_to_user).toBeDefined();
    expect(action.suggest_to_user!.length).toBeGreaterThanOrEqual(3);
    expect(action.suggest_to_user!.some(s => /archive/i.test(s))).toBe(true);
    expect(action.suggest_to_user!.some(s => /review/i.test(s))).toBe(true);
  });

  it('returns escalate action for go/blocked status', () => {
    const action = buildNextAction('go:blocked', context, {
      change,
      blockedNodes: ['impl-2-1', 'impl-2-2'],
    });

    expect(action.command).toBe('escalate');
    expect(action.context).toBe(context);
    expect(action.description).toMatch(/blocked/i);
  });

  it('returns wait action for go/waiting status', () => {
    const action = buildNextAction('go:waiting', context, { change });

    expect(action.command).toBe('wait');
    expect(action.context).toBe(context);
    expect(action.description).toMatch(/wait|in.progress/i);
  });

  // ── specwork node statuses ───────────────────────────────────────────────

  it('returns subagent action with on_pass/on_fail for node/start', () => {
    const action = buildNextAction('node:start', context, {
      change,
      nodeId: 'impl-1-1',
    });

    expect(action.context).toBe(context);
    expect(action.on_pass).toBeDefined();
    expect(action.on_fail).toBeDefined();
    expect(action.on_pass).toMatch(/specwork node complete/);
    expect(action.on_pass).toMatch(/impl-1-1/);
    expect(action.on_fail).toMatch(/specwork node fail/);
    expect(action.on_fail).toMatch(/impl-1-1/);
  });

  it('returns go-again action for node/complete', () => {
    const action = buildNextAction('node:complete', context, {
      change,
      nodeId: 'impl-1-1',
    });

    expect(action.command).toMatch(/specwork go/);
    expect(action.command).toMatch(change);
    expect(action.context).toBe(context);
    expect(action.description).toMatch(/next batch/i);
  });

  it('returns respawn action for node/fail with retries remaining', () => {
    const action = buildNextAction('node:fail', context, {
      change,
      nodeId: 'impl-1-1',
      retriesLeft: 1,
    });

    expect(action.command).toBe('subagent:respawn');
    expect(action.context).toBe(context);
    expect(action.description).toMatch(/retry|re-spawn|respawn/i);
    // Should NOT have suggest_to_user — this is automated retry
    expect(action.suggest_to_user).toBeUndefined();
  });

  it('returns escalate action for node/fail with retries exhausted', () => {
    const action = buildNextAction('node:fail', context, {
      change,
      nodeId: 'impl-1-1',
      retriesLeft: 0,
    });

    expect(action.command).toMatch(/escalate/);
    expect(action.context).toBe(context);
    expect(action.suggest_to_user).toBeDefined();
    expect(action.suggest_to_user!.some(s => /manual|fix/i.test(s))).toBe(true);
  });

  it('returns suggest action for node/escalate', () => {
    const action = buildNextAction('node:escalate', context, {
      change,
      nodeId: 'impl-1-1',
    });

    expect(action.command).toBe('suggest');
    expect(action.context).toBe(context);
    expect(action.suggest_to_user).toBeDefined();
  });

  it('returns complete action with on_pass/on_fail for node/verify:pass', () => {
    const action = buildNextAction('node:verify:pass', context, {
      change,
      nodeId: 'impl-1-1',
    });

    expect(action.context).toBe(context);
    expect(action.on_pass).toBeDefined();
    expect(action.on_pass).toMatch(/specwork node complete/);
    expect(action.on_pass).toMatch(/impl-1-1/);
  });

  it('returns fail action for node/verify:fail', () => {
    const action = buildNextAction('node:verify:fail', context, {
      change,
      nodeId: 'impl-1-1',
    });

    expect(action.context).toBe(context);
    expect(action.on_fail).toBeDefined();
    expect(action.on_fail).toMatch(/specwork node fail/);
    expect(action.on_fail).toMatch(/impl-1-1/);
  });

  // ── context is always present ───────────────────────────────────────────

  it('always includes context field even when empty', () => {
    const action = buildNextAction('go:ready', '', {
      change,
      readyNodes: ['impl-1-1'],
    });

    expect(action.context).toBe('');
  });
});
