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

// ── Helper: mark all nodes complete so "run" reports done ─────────────────────

function markAllNodesComplete(dir: string, change: string): void {
  const statePath = path.join(dir, '.specwork', 'graph', change, 'state.yaml');
  const raw = fs.readFileSync(statePath, 'utf-8');
  const state = parseYaml(raw) as Record<string, unknown>;

  const nodes = state.nodes as Record<string, Record<string, unknown>>;
  const ts = new Date().toISOString();
  for (const nodeId of Object.keys(nodes)) {
    nodes[nodeId] = { ...nodes[nodeId], status: 'complete', completed_at: ts };
  }

  state.status = 'in_progress';
  state.updated_at = ts;
  fs.writeFileSync(statePath, stringifyYaml(state), 'utf-8');
}

// ══════════════════════════════════════════════════════════════════════════════
// specwork new
// ══════════════════════════════════════════════════════════════════════════════

describe('specwork new', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
    runSpecwork(dir, 'init');
  });

  afterEach(() => {
    cleanup(dir);
  });

  it('creates the change directory with proposal.md, design.md, and tasks.md', () => {
    const result = runSpecwork(dir, 'new my-feature');
    expect(result.exitCode).toBe(0);

    const changeDir = path.join(dir, '.specwork', 'changes', 'my-feature');
    expect(fs.existsSync(changeDir)).toBe(true);
    expect(fs.existsSync(path.join(changeDir, 'proposal.md'))).toBe(true);
    expect(fs.existsSync(path.join(changeDir, 'design.md'))).toBe(true);
    expect(fs.existsSync(path.join(changeDir, 'tasks.md'))).toBe(true);
  });

  it('creates .specwork.yaml metadata with draft status', () => {
    runSpecwork(dir, 'new my-feature');

    const metaPath = path.join(dir, '.specwork', 'changes', 'my-feature', '.specwork.yaml');
    expect(fs.existsSync(metaPath)).toBe(true);

    const meta = parseYaml(fs.readFileSync(metaPath, 'utf-8')) as Record<string, unknown>;
    expect(meta.schema).toBe('specwork-change/v1');
    expect(meta.change).toBe('my-feature');
    expect(meta.status).toBe('draft');
    expect(meta).toHaveProperty('created_at');
  });

  it('rejects duplicate change names', () => {
    runSpecwork(dir, 'new my-feature');
    const second = runSpecwork(dir, 'new my-feature');

    expect(second.exitCode).not.toBe(0);
    expect(second.stderr + second.stdout).toMatch(/already exists/i);
  });

  it('rejects invalid change name with uppercase letters', () => {
    const result = runSpecwork(dir, 'new MyFeature');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/invalid change name/i);
  });

  it('rejects invalid change name starting with a hyphen', () => {
    const result = runSpecwork(dir, 'new -bad-name');
    expect(result.exitCode).not.toBe(0);
  });

  it('accepts valid kebab-case change names', () => {
    const result = runSpecwork(dir, 'new valid-change-123');
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(path.join(dir, '.specwork', 'changes', 'valid-change-123'))).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// specwork graph generate / validate / show
// ══════════════════════════════════════════════════════════════════════════════

describe('specwork graph', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
    runSpecwork(dir, 'init');
    runSpecwork(dir, 'new my-change');
    writeTasksFile(dir, 'my-change', SIMPLE_TASKS);
  });

  afterEach(() => {
    cleanup(dir);
  });

  it('generate creates graph.yaml and state.yaml', () => {
    const result = runSpecwork(dir, 'graph generate my-change');
    expect(result.exitCode).toBe(0);

    const graphPath = path.join(dir, '.specwork', 'graph', 'my-change', 'graph.yaml');
    const statePath = path.join(dir, '.specwork', 'graph', 'my-change', 'state.yaml');

    expect(fs.existsSync(graphPath)).toBe(true);
    expect(fs.existsSync(statePath)).toBe(true);

    const graph = parseYaml(fs.readFileSync(graphPath, 'utf-8')) as Record<string, unknown>;
    expect(graph).toHaveProperty('nodes');
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect((graph.nodes as unknown[]).length).toBeGreaterThan(0);
  });

  it('generate state.yaml initializes all nodes as pending', () => {
    runSpecwork(dir, 'graph generate my-change');

    const statePath = path.join(dir, '.specwork', 'graph', 'my-change', 'state.yaml');
    const state = parseYaml(fs.readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
    const nodes = state.nodes as Record<string, Record<string, unknown>>;

    for (const node of Object.values(nodes)) {
      expect(node.status).toBe('pending');
    }
  });

  it('validate passes on a freshly generated graph', () => {
    runSpecwork(dir, 'graph generate my-change');
    const result = runSpecwork(dir, 'graph validate my-change');

    // success/warn messages go to stderr; exitCode 0 is the proof of validity
    expect(result.exitCode).toBe(0);
  });

  it('validate errors on a missing graph', () => {
    const result = runSpecwork(dir, 'graph validate nonexistent-change');
    expect(result.exitCode).not.toBe(0);
  });

  it('show produces table output by default', () => {
    runSpecwork(dir, 'graph generate my-change');
    const result = runSpecwork(dir, 'graph show my-change');

    expect(result.exitCode).toBe(0);
    // Table output includes column headers
    expect(result.stdout).toMatch(/ID|Type|Deps/i);
  });

  it('show --format mermaid produces mermaid diagram', () => {
    runSpecwork(dir, 'graph generate my-change');
    const result = runSpecwork(dir, 'graph show my-change --format mermaid');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^graph TD/m);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// specwork run
// ══════════════════════════════════════════════════════════════════════════════

describe('specwork run', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
    setupProjectWithGraph(dir);
  });

  afterEach(() => {
    cleanup(dir);
  });

  it('returns ready nodes as JSON with --json flag', () => {
    const result = runSpecwork(dir, '--json run my-change');
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed).toHaveProperty('ready');
    expect(parsed).toHaveProperty('progress');
    expect(Array.isArray(parsed.ready)).toBe(true);
    expect((parsed.ready as unknown[]).length).toBeGreaterThan(0);
  });

  it('first ready node is the snapshot node', () => {
    const result = runSpecwork(dir, '--json run my-change');
    const parsed = JSON.parse(result.stdout) as { ready: Array<{ id: string }> };
    expect(parsed.ready[0].id).toBe('snapshot');
  });

  it('reports done when all nodes are complete', () => {
    markAllNodesComplete(dir, 'my-change');

    const result = runSpecwork(dir, '--json run my-change');
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.reason).toBe('complete');
    expect((parsed.ready as unknown[]).length).toBe(0);
  });

  it('dry-run prints plan without acquiring lock', () => {
    const result = runSpecwork(dir, '--json run my-change --dry-run');
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.dry_run).toBe(true);
    expect(parsed).toHaveProperty('ready');

    // Lock file should not exist after dry-run
    const lockPath = path.join(dir, '.specwork', 'graph', 'my-change', '.lock');
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('--force overrides a stale lock', () => {
    // Create a stale lock with a non-existent PID
    const lockPath = path.join(dir, '.specwork', 'graph', 'my-change', '.lock');
    const staleLock = stringifyYaml({ pid: 99999999, acquired_at: new Date(Date.now() - 60000).toISOString() });
    fs.writeFileSync(lockPath, staleLock, 'utf-8');

    const result = runSpecwork(dir, '--json run my-change --force');
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed).toHaveProperty('ready');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// specwork status
// ══════════════════════════════════════════════════════════════════════════════

describe('specwork status', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
    setupProjectWithGraph(dir);
  });

  afterEach(() => {
    cleanup(dir);
  });

  it('shows node table with statuses', () => {
    const result = runSpecwork(dir, 'status my-change');
    expect(result.exitCode).toBe(0);
    // table() writes to stdout — verify node IDs and status appear
    expect(result.stdout).toMatch(/snapshot/);
    // status icons (○ for pending) appear in table rows
    expect(result.stdout).toMatch(/○/);
  });

  it('shows progress count via JSON output', () => {
    const result = runSpecwork(dir, '--json status my-change');
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const progress = parsed.progress as Record<string, number>;
    expect(progress).toHaveProperty('total');
    expect(progress.total).toBeGreaterThan(0);
    expect(progress).toHaveProperty('complete');
  });

  it('returns JSON with nodes array when --json flag is used', () => {
    const result = runSpecwork(dir, '--json status my-change');
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed).toHaveProperty('nodes');
    expect(parsed).toHaveProperty('progress');
    expect(Array.isArray(parsed.nodes)).toBe(true);
  });

  it('lists all changes when no change name is given', () => {
    const result = runSpecwork(dir, 'status');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/my-change/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// specwork config show / set
// ══════════════════════════════════════════════════════════════════════════════

describe('specwork config', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
    runSpecwork(dir, 'init');
  });

  afterEach(() => {
    cleanup(dir);
  });

  it('show displays current config as a table', () => {
    const result = runSpecwork(dir, 'config show');
    expect(result.exitCode).toBe(0);
    // Table includes key-value rows
    expect(result.stdout).toMatch(/models\.(default|test_writer)/);
  });

  it('show --key returns a specific dotpath value via JSON', () => {
    const result = runSpecwork(dir, '--json config show --key models.default');
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.value).toBe('sonnet');
  });

  it('show --key errors on missing key', () => {
    const result = runSpecwork(dir, 'config show --key does.not.exist');
    expect(result.exitCode).not.toBe(0);
  });

  it('set updates a dotpath value', () => {
    const setResult = runSpecwork(dir, 'config set models.default opus');
    expect(setResult.exitCode).toBe(0);

    const showResult = runSpecwork(dir, '--json config show --key models.default');
    expect(showResult.exitCode).toBe(0);
    const parsed = JSON.parse(showResult.stdout) as Record<string, unknown>;
    expect(parsed.value).toBe('opus');
  });

  it('set handles string values', () => {
    const setResult = runSpecwork(dir, 'config set execution.parallel_mode parallel');
    expect(setResult.exitCode).toBe(0);

    const showResult = runSpecwork(dir, '--json config show --key execution.parallel_mode');
    expect(showResult.exitCode).toBe(0);
    const parsed = JSON.parse(showResult.stdout) as Record<string, unknown>;
    expect(parsed.value).toBe('parallel');
  });

  it('show returns JSON when --json is passed', () => {
    const result = runSpecwork(dir, '--json config show');
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed).toHaveProperty('models');
    expect(parsed).toHaveProperty('execution');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// specwork snapshot
// ══════════════════════════════════════════════════════════════════════════════

describe('specwork snapshot', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
    runSpecwork(dir, 'init');
  });

  afterEach(() => {
    cleanup(dir);
  });

  it('generates snapshot.md in .specwork/env/', () => {
    const result = runSpecwork(dir, 'snapshot');
    expect(result.exitCode).toBe(0);

    const snapshotPath = path.join(dir, '.specwork', 'env', 'snapshot.md');
    expect(fs.existsSync(snapshotPath)).toBe(true);
  });

  it('snapshot.md contains file tree content', () => {
    runSpecwork(dir, 'snapshot');

    const snapshotPath = path.join(dir, '.specwork', 'env', 'snapshot.md');
    const content = fs.readFileSync(snapshotPath, 'utf-8');
    // Snapshot should be a non-empty markdown file
    expect(content.length).toBeGreaterThan(0);
    expect(content).toMatch(/snapshot|file|project/i);
  });

  it('exits with code 0 on completion', () => {
    // success/info messages go to stderr; exitCode 0 confirms completion
    const result = runSpecwork(dir, 'snapshot');
    expect(result.exitCode).toBe(0);
  });
});
