import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { createTestProject, runForeman, cleanup, writeTasksFile } from '../integration/helpers.js';

describe('foreman plan', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
    runForeman(dir, 'init');
  });

  afterEach(() => {
    cleanup(dir);
  });

  it('creates a change and outputs JSON payload with description', () => {
    const result = runForeman(dir, 'plan "Add JWT authentication" --json');
    expect(result.exitCode).toBe(0);

    const out = JSON.parse(result.stdout);
    expect(out.change).toMatch(/^add-jwt-authentication$/);
    expect(out.description).toBe('Add JWT authentication');
    expect(out.path).toContain('.foreman/changes/');
    expect(out.files).toContain('proposal.md');
    expect(out.files).toContain('tasks.md');
  });

  it('creates the change directory with all template files', () => {
    const result = runForeman(dir, 'plan "Add JWT authentication" --json');
    const out = JSON.parse(result.stdout);

    expect(fs.existsSync(out.path)).toBe(true);
    expect(fs.existsSync(path.join(out.path, 'proposal.md'))).toBe(true);
    expect(fs.existsSync(path.join(out.path, 'design.md'))).toBe(true);
    expect(fs.existsSync(path.join(out.path, 'tasks.md'))).toBe(true);
    expect(fs.existsSync(path.join(out.path, '.foreman.yaml'))).toBe(true);
  });

  it('writes description into proposal.md', () => {
    runForeman(dir, 'plan "Add JWT authentication" --json');
    const proposalPath = path.join(dir, '.foreman', 'changes', 'add-jwt-authentication', 'proposal.md');
    const content = fs.readFileSync(proposalPath, 'utf-8');
    expect(content).toContain('Add JWT authentication');
  });

  it('sets .foreman.yaml status to planning', () => {
    runForeman(dir, 'plan "Add JWT authentication" --json');
    const metaPath = path.join(dir, '.foreman', 'changes', 'add-jwt-authentication', '.foreman.yaml');
    const meta = parseYaml(fs.readFileSync(metaPath, 'utf-8')) as Record<string, unknown>;
    expect(meta.status).toBe('planning');
    expect(meta.description).toBe('Add JWT authentication');
  });

  it('slugifies description into kebab-case change name', () => {
    const result = runForeman(dir, 'plan "Fix the Login Bug" --json');
    const out = JSON.parse(result.stdout);
    expect(out.change).toBe('fix-the-login-bug');
  });

  it('accepts --name to override auto-generated change name', () => {
    const result = runForeman(dir, 'plan "Add JWT authentication" --name auth-jwt --json');
    const out = JSON.parse(result.stdout);
    expect(out.change).toBe('auth-jwt');
  });

  it('fails if change name already exists', () => {
    runForeman(dir, 'plan "First change" --name my-change --json');
    const result = runForeman(dir, 'plan "Second change" --name my-change --json');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('already exists');
  });

  it('creates change successfully without --json flag', () => {
    const result = runForeman(dir, 'plan "Add JWT authentication"');
    expect(result.exitCode).toBe(0);
    // Verify the change was actually created on disk
    const changeDir = path.join(dir, '.foreman', 'changes', 'add-jwt-authentication');
    expect(fs.existsSync(changeDir)).toBe(true);
  });

  it('includes next_steps in JSON output pointing to engine skill', () => {
    const result = runForeman(dir, 'plan "Add JWT authentication" --json');
    const out = JSON.parse(result.stdout);
    expect(out.next_steps).toBeDefined();
    expect(out.next_steps).toContain('proposal');
  });

  it('defaults to brainstorm mode', () => {
    const result = runForeman(dir, 'plan "Add JWT authentication" --json');
    const out = JSON.parse(result.stdout);
    expect(out.mode).toBe('brainstorm');
  });

  it('sets yolo mode with --yolo flag', () => {
    const result = runForeman(dir, 'plan "Add JWT authentication" --yolo --json');
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.mode).toBe('yolo');
  });

  it('sets .foreman.yaml mode field in yolo mode', () => {
    runForeman(dir, 'plan "Add JWT authentication" --yolo --json');
    const metaPath = path.join(dir, '.foreman', 'changes', 'add-jwt-authentication', '.foreman.yaml');
    const meta = parseYaml(fs.readFileSync(metaPath, 'utf-8')) as Record<string, unknown>;
    expect(meta.mode).toBe('yolo');
  });
});

describe('foreman go', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
    runForeman(dir, 'init');
  });

  afterEach(() => {
    cleanup(dir);
  });

  it('outputs execution payload for a change with a graph', () => {
    runForeman(dir, 'new my-change');
    writeTasksFile(dir, 'my-change', `## 1. Setup\n\n- [ ] 1.1 Initialize the module\n`);
    runForeman(dir, 'graph generate my-change');

    const result = runForeman(dir, 'go my-change --json');
    expect(result.exitCode).toBe(0);

    const out = JSON.parse(result.stdout);
    expect(out.change).toBe('my-change');
    expect(out.status).toBe('ready');
    expect(out.ready).toBeDefined();
    expect(out.progress).toBeDefined();
    expect(out.progress.total).toBeGreaterThan(0);
  });

  it('fails if change does not exist', () => {
    const result = runForeman(dir, 'go nonexistent --json');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('not found');
  });

  it('auto-generates graph if tasks.md exists but no graph', () => {
    runForeman(dir, 'new my-change');
    writeTasksFile(dir, 'my-change', `## 1. Setup\n\n- [ ] 1.1 Initialize the module\n`);

    // No explicit graph generate — go should auto-generate
    const result = runForeman(dir, 'go my-change --json');
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.status).toBe('ready');
    expect(out.auto_generated_graph).toBe(true);
  });

  it('fails if no tasks.md and no graph', () => {
    runForeman(dir, 'new my-change');
    // Delete tasks.md to simulate missing tasks
    fs.unlinkSync(path.join(dir, '.foreman', 'changes', 'my-change', 'tasks.md'));
    const result = runForeman(dir, 'go my-change --json');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/graph|tasks|plan/i);
  });

  it('reports done when all nodes are complete', () => {
    runForeman(dir, 'new my-change');
    writeTasksFile(dir, 'my-change', `## 1. Setup\n\n- [ ] 1.1 Initialize the module\n`);
    runForeman(dir, 'graph generate my-change');

    // Manually mark all nodes complete
    const stateFp = path.join(dir, '.foreman', 'graph', 'my-change', 'state.yaml');
    const raw = fs.readFileSync(stateFp, 'utf-8');
    const state = parseYaml(raw) as Record<string, any>;
    const ts = new Date().toISOString();
    for (const nodeId of Object.keys(state.nodes)) {
      state.nodes[nodeId] = { ...state.nodes[nodeId], status: 'complete', completed_at: ts };
    }
    state.status = 'in_progress';
    state.updated_at = ts;
    fs.writeFileSync(stateFp, stringifyYaml(state), 'utf-8');

    const result = runForeman(dir, 'go my-change --json');
    const out = JSON.parse(result.stdout);
    expect(out.status).toBe('done');
  });

  it('passes --from flag through and skips preceding nodes', () => {
    runForeman(dir, 'new my-change');
    writeTasksFile(dir, 'my-change', `## 1. Setup\n\n- [ ] 1.1 Initialize the module\n- [ ] 1.2 Configure\n`);
    runForeman(dir, 'graph generate my-change');

    // --from impl-1-1 skips snapshot + write-tests, but those are deps of impl-1-1
    // so impl-1-1 ends up blocked — exit code 2 (BLOCKED) with skipped nodes listed
    const result = runForeman(dir, 'go my-change --from impl-1-1 --json');
    expect(result.exitCode).toBe(2); // BLOCKED
    const out = JSON.parse(result.stdout);
    expect(out.status).toBe('blocked');
    expect(out.skipped).toBeDefined();
    expect(out.skipped.length).toBeGreaterThan(0);
  });

  it('outputs human-readable text without --json flag', () => {
    runForeman(dir, 'new my-change');
    writeTasksFile(dir, 'my-change', `## 1. Setup\n\n- [ ] 1.1 Initialize the module\n`);
    runForeman(dir, 'graph generate my-change');

    const result = runForeman(dir, 'go my-change');
    expect(result.exitCode).toBe(0);
    // success/info messages go to stderr, table goes to stdout
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/my-change|snapshot|ready/i);
  });
});
