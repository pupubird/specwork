import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { createTestProject, runSpecwork, cleanup, writeTasksFile } from './helpers.js';

// ── Minimal tasks.md that produces a valid, small graph ────────────────────────
const SIMPLE_TASKS = `## 1. Setup

- [ ] 1.1 Initialize the module
- [ ] 1.2 Add configuration

## 2. Implementation

- [ ] 2.1 Write the core logic
`;

// ── Helper: init a project and create a change with a generated graph ──────────

function setupProjectWithGraph(dir: string, change = 'my-change'): void {
  runSpecwork(dir, 'init');
  runSpecwork(dir, `new ${change}`);
  writeTasksFile(dir, change, SIMPLE_TASKS);
  runSpecwork(dir, `graph generate ${change}`);
}

// ── Helper: mark specific nodes as complete ─────────────────────────────────────

function markNodeComplete(dir: string, change: string, nodeId: string): void {
  const sp = path.join(dir, '.specwork', 'graph', change, 'state.yaml');
  const raw = fs.readFileSync(sp, 'utf-8');
  const state = parseYaml(raw) as Record<string, unknown>;
  const nodes = state.nodes as Record<string, Record<string, unknown>>;
  const ts = new Date().toISOString();
  nodes[nodeId] = { ...nodes[nodeId], status: 'complete', completed_at: ts };
  state.updated_at = ts;
  fs.writeFileSync(sp, stringifyYaml(state), 'utf-8');
}

// ── Helper: mark all nodes as complete ──────────────────────────────────────────

function markAllNodesComplete(dir: string, change: string): void {
  const sp = path.join(dir, '.specwork', 'graph', change, 'state.yaml');
  const raw = fs.readFileSync(sp, 'utf-8');
  const state = parseYaml(raw) as Record<string, unknown>;
  const nodes = state.nodes as Record<string, Record<string, unknown>>;
  const ts = new Date().toISOString();
  for (const nodeId of Object.keys(nodes)) {
    nodes[nodeId] = { ...nodes[nodeId], status: 'complete', completed_at: ts };
  }
  state.updated_at = ts;
  fs.writeFileSync(sp, stringifyYaml(state), 'utf-8');
}

// ── Helper: mark a node as in_progress ──────────────────────────────────────────

function markNodeInProgress(dir: string, change: string, nodeId: string): void {
  const sp = path.join(dir, '.specwork', 'graph', change, 'state.yaml');
  const raw = fs.readFileSync(sp, 'utf-8');
  const state = parseYaml(raw) as Record<string, unknown>;
  const nodes = state.nodes as Record<string, Record<string, unknown>>;
  const ts = new Date().toISOString();
  nodes[nodeId] = { ...nodes[nodeId], status: 'in_progress', started_at: ts };
  state.updated_at = ts;
  fs.writeFileSync(sp, stringifyYaml(state), 'utf-8');
}

// ── Helper: mark a node as failed (for blocked scenario) ────────────────────────

function markNodeFailed(dir: string, change: string, nodeId: string): void {
  const sp = path.join(dir, '.specwork', 'graph', change, 'state.yaml');
  const raw = fs.readFileSync(sp, 'utf-8');
  const state = parseYaml(raw) as Record<string, unknown>;
  const nodes = state.nodes as Record<string, Record<string, unknown>>;
  const ts = new Date().toISOString();
  nodes[nodeId] = { ...nodes[nodeId], status: 'escalated', completed_at: ts, error: 'test failure' };
  state.updated_at = ts;
  fs.writeFileSync(sp, stringifyYaml(state), 'utf-8');
}

// ══════════════════════════════════════════════════════════════════════════════
// specwork go — next_action in JSON output
// ══════════════════════════════════════════════════════════════════════════════

describe('specwork go --json next_action', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
  });

  afterEach(() => {
    cleanup(dir);
  });

  it('includes next_action with team:spawn for ready status', () => {
    setupProjectWithGraph(dir);

    const result = runSpecwork(dir, 'go my-change --json');
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.status).toBe('ready');
    expect(json.next_action).toBeDefined();
    expect(json.next_action.command).toBe('team:spawn');
    expect(json.next_action.context).toBeDefined();
    expect(typeof json.next_action.description).toBe('string');
  });

  it('includes next_action with suggest for done status', () => {
    setupProjectWithGraph(dir);
    markAllNodesComplete(dir, 'my-change');

    // Check off all tasks so archive doesn't block
    const tasksPath = path.join(dir, '.specwork', 'changes', 'my-change', 'tasks.md');
    if (fs.existsSync(tasksPath)) {
      const content = fs.readFileSync(tasksPath, 'utf-8');
      fs.writeFileSync(tasksPath, content.replace(/- \[ \]/g, '- [x]'), 'utf-8');
    }

    const result = runSpecwork(dir, 'go my-change --json');
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.status).toBe('done');
    expect(json.next_action).toBeDefined();
    expect(json.next_action.command).toBe('suggest');
    expect(json.next_action.suggest_to_user).toBeDefined();
    expect(Array.isArray(json.next_action.suggest_to_user)).toBe(true);
    expect(json.next_action.suggest_to_user.length).toBeGreaterThanOrEqual(3);
  });

  it('includes next_action with wait for waiting status', () => {
    setupProjectWithGraph(dir);
    // Mark snapshot as in_progress — no nodes ready but one running
    markNodeInProgress(dir, 'my-change', 'snapshot');

    const result = runSpecwork(dir, 'go my-change --json');
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.status).toBe('waiting');
    expect(json.next_action).toBeDefined();
    expect(json.next_action.command).toBe('wait');
  });

  it('includes context from .specwork.yaml description', () => {
    setupProjectWithGraph(dir);

    const result = runSpecwork(dir, 'go my-change --json');
    const json = JSON.parse(result.stdout);

    // .specwork.yaml was created by `specwork new`, should have a description
    expect(json.next_action.context).toBeDefined();
    expect(typeof json.next_action.context).toBe('string');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// specwork node complete --json — next_action
// ══════════════════════════════════════════════════════════════════════════════

describe('specwork node complete --json next_action', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
  });

  afterEach(() => {
    cleanup(dir);
  });

  it('includes next_action pointing to specwork go for next batch', () => {
    setupProjectWithGraph(dir);
    // Start and complete the snapshot node
    runSpecwork(dir, 'node start my-change snapshot');

    const result = runSpecwork(dir, 'node complete my-change snapshot --l0 "snapshot done" --no-commit --json');
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.next_action).toBeDefined();
    expect(json.next_action.command).toMatch(/specwork go/);
    expect(json.next_action.command).toMatch(/my-change/);
    expect(json.next_action.context).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// specwork node start --json — next_action
// ══════════════════════════════════════════════════════════════════════════════

describe('specwork node start --json next_action', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
  });

  afterEach(() => {
    cleanup(dir);
  });

  it('includes next_action with on_pass and on_fail', () => {
    setupProjectWithGraph(dir);

    const result = runSpecwork(dir, 'node start my-change snapshot --json');
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.next_action).toBeDefined();
    expect(json.next_action.on_pass).toBeDefined();
    expect(json.next_action.on_fail).toBeDefined();
    expect(json.next_action.on_pass).toMatch(/specwork node complete/);
    expect(json.next_action.on_fail).toMatch(/specwork node fail/);
    expect(json.next_action.context).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// specwork node verify --json — next_action
// ══════════════════════════════════════════════════════════════════════════════

describe('specwork node verify --json next_action', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
  });

  afterEach(() => {
    cleanup(dir);
  });

  it('includes next_action with on_pass referencing complete for PASS verdict', () => {
    setupProjectWithGraph(dir);
    // Start snapshot so we can verify it
    runSpecwork(dir, 'node start my-change snapshot');

    const result = runSpecwork(dir, 'node verify my-change snapshot --json');
    // Verdict may be PASS or FAIL depending on validation rules, but next_action should exist
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.next_action).toBeDefined();
    expect(json.next_action.context).toBeDefined();

    if (json.verdict === 'PASS') {
      expect(json.next_action.on_pass).toMatch(/specwork node complete/);
    } else {
      expect(json.next_action.on_fail).toMatch(/specwork node fail/);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// specwork node fail --json — next_action
// ══════════════════════════════════════════════════════════════════════════════

describe('specwork node fail --json next_action', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
  });

  afterEach(() => {
    cleanup(dir);
  });

  it('includes next_action with respawn for retries remaining', () => {
    setupProjectWithGraph(dir);
    markNodeComplete(dir, 'my-change', 'snapshot');
    // Start write-tests, then fail it
    runSpecwork(dir, 'node start my-change write-tests');

    const result = runSpecwork(dir, 'node fail my-change write-tests --reason "tests not compiling" --json');
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.next_action).toBeDefined();
    expect(json.next_action.context).toBeDefined();

    // write-tests has retry: 2, so first failure should suggest respawn
    if (json.status === 'failed') {
      expect(json.next_action.command).toBe('subagent:respawn');
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// specwork node escalate --json — next_action
// ══════════════════════════════════════════════════════════════════════════════

describe('specwork node escalate --json next_action', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
  });

  afterEach(() => {
    cleanup(dir);
  });

  it('includes next_action with suggest and suggest_to_user', () => {
    setupProjectWithGraph(dir);
    markNodeComplete(dir, 'my-change', 'snapshot');
    runSpecwork(dir, 'node start my-change write-tests');

    const result = runSpecwork(dir, 'node escalate my-change write-tests --reason "manual intervention needed" --json');
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.next_action).toBeDefined();
    expect(json.next_action.command).toBe('suggest');
    expect(json.next_action.suggest_to_user).toBeDefined();
    expect(Array.isArray(json.next_action.suggest_to_user)).toBe(true);
    expect(json.next_action.context).toBeDefined();
  });
});
