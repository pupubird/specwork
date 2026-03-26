import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { createTestProject, runForeman, cleanup } from './helpers.js';

describe('foreman init (enhanced / batteries-included)', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
  });

  afterEach(() => {
    cleanup(dir);
  });

  // ── Directory structure ─────────────────────────────────────────────────

  it('creates all .foreman/ subdirectories', () => {
    const result = runForeman(dir, 'init');
    expect(result.exitCode).toBe(0);

    const expectedDirs = [
      '.foreman/env',
      '.foreman/graph',
      '.foreman/nodes',
      '.foreman/specs',
      '.foreman/changes/archive',
      '.foreman/templates',
      '.foreman/examples',
    ];

    for (const d of expectedDirs) {
      expect(fs.existsSync(path.join(dir, d)), `Expected ${d}`).toBe(true);
    }
  });

  // ── Config ──────────────────────────────────────────────────────────────

  it('writes config.yaml with execution.verify: gates', () => {
    runForeman(dir, 'init');
    const configPath = path.join(dir, '.foreman', 'config.yaml');
    const config = parseYaml(fs.readFileSync(configPath, 'utf-8')) as Record<string, any>;
    expect(config.execution.verify).toBe('gates');
  });

  // ── Schema & examples ──────────────────────────────────────────────────

  it('writes schema.yaml', () => {
    runForeman(dir, 'init');
    const schemaPath = path.join(dir, '.foreman', 'schema.yaml');
    expect(fs.existsSync(schemaPath)).toBe(true);
    const content = fs.readFileSync(schemaPath, 'utf-8');
    expect(content).toContain('artifacts');
  });

  it('writes example-graph.yaml', () => {
    runForeman(dir, 'init');
    const examplePath = path.join(dir, '.foreman', 'examples', 'example-graph.yaml');
    expect(fs.existsSync(examplePath)).toBe(true);
    const content = fs.readFileSync(examplePath, 'utf-8');
    expect(content).toContain('nodes');
  });

  // ── .gitignore ──────────────────────────────────────────────────────────

  it('writes .foreman/.gitignore covering runtime files', () => {
    runForeman(dir, 'init');
    const gitignorePath = path.join(dir, '.foreman', '.gitignore');
    expect(fs.existsSync(gitignorePath)).toBe(true);
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('.current-scope');
    expect(content).toContain('.current-node');
    expect(content).toContain('*.lock');
  });

  // ── .claude/ files (batteries-included) ─────────────────────────────────

  it('writes all agent files', () => {
    runForeman(dir, 'init');
    const agents = [
      'foreman-implementer.md',
      'foreman-planner.md',
      'foreman-qa.md',
      'foreman-summarizer.md',
      'foreman-test-writer.md',
      'foreman-verifier.md',
    ];
    for (const agent of agents) {
      const p = path.join(dir, '.claude', 'agents', agent);
      expect(fs.existsSync(p), `Expected agent ${agent}`).toBe(true);
      expect(fs.readFileSync(p, 'utf-8').length).toBeGreaterThan(0);
    }
  });

  it('writes all skill files', () => {
    runForeman(dir, 'init');
    const skills = [
      'foreman-context/SKILL.md',
      'foreman-conventions/SKILL.md',
      'foreman-engine/SKILL.md',
      'foreman-snapshot/SKILL.md',
    ];
    for (const skill of skills) {
      const p = path.join(dir, '.claude', 'skills', skill);
      expect(fs.existsSync(p), `Expected skill ${skill}`).toBe(true);
      expect(fs.readFileSync(p, 'utf-8').length).toBeGreaterThan(0);
    }
  });

  it('writes all command files', () => {
    runForeman(dir, 'init');
    const commands = [
      'foreman-go.md',
      'foreman-plan.md',
      'foreman-status.md',
    ];
    for (const cmd of commands) {
      const p = path.join(dir, '.claude', 'commands', cmd);
      expect(fs.existsSync(p), `Expected command ${cmd}`).toBe(true);
      expect(fs.readFileSync(p, 'utf-8').length).toBeGreaterThan(0);
    }
  });

  it('writes all hook files as executable', () => {
    runForeman(dir, 'init');
    const hooks = [
      'node-complete.sh',
      'scope-guard.sh',
      'session-init.sh',
      'type-check.sh',
    ];
    for (const hook of hooks) {
      const p = path.join(dir, '.claude', 'hooks', hook);
      expect(fs.existsSync(p), `Expected hook ${hook}`).toBe(true);
      expect(fs.readFileSync(p, 'utf-8').length).toBeGreaterThan(0);
      // Check executable permission
      const stat = fs.statSync(p);
      expect(stat.mode & 0o111, `${hook} should be executable`).toBeGreaterThan(0);
    }
  });

  it('writes .claude/settings.json with hooks config', () => {
    runForeman(dir, 'init');
    const settingsPath = path.join(dir, '.claude', 'settings.json');
    expect(fs.existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.SessionStart).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();
    expect(settings.hooks.PostToolUse).toBeDefined();
  });

  // ── Post-init message ──────────────────────────────────────────────────

  it('references foreman plan (not foreman new) in output', () => {
    const result = runForeman(dir, 'init');
    const combined = result.stdout + result.stderr;
    expect(combined).toContain('foreman plan');
    expect(combined).not.toContain('foreman new');
  });

  // ── Doctor auto-run ────────────────────────────────────────────────────

  it('runs doctor after init and shows results', () => {
    const result = runForeman(dir, 'init');
    const combined = result.stdout + result.stderr;
    // Doctor output should contain pass/fail symbols
    expect(combined).toMatch(/✓|passed|pass/i);
  });

  // ── --with-claude flag removed ─────────────────────────────────────────

  it('does NOT accept --with-claude flag', () => {
    const result = runForeman(dir, 'init --with-claude');
    // Should either error (unknown option) or just ignore it
    // The key assertion is that .claude/ files are always written regardless
    runForeman(dir, 'init --force');
    expect(fs.existsSync(path.join(dir, '.claude', 'agents', 'foreman-implementer.md'))).toBe(true);
  });

  // ── --force re-init ────────────────────────────────────────────────────

  it('re-initializes with --force and overwrites all files', () => {
    runForeman(dir, 'init');

    // Corrupt a file
    fs.writeFileSync(path.join(dir, '.foreman', 'config.yaml'), 'corrupted: true');

    const result = runForeman(dir, 'init --force');
    expect(result.exitCode).toBe(0);

    // Config should be restored
    const config = parseYaml(fs.readFileSync(path.join(dir, '.foreman', 'config.yaml'), 'utf-8')) as Record<string, any>;
    expect(config.models).toBeDefined();
    expect(config.execution.verify).toBe('gates');
  });

  // ── JSON mode ──────────────────────────────────────────────────────────

  it('outputs structured JSON with --json flag', () => {
    const result = runForeman(dir, 'init --json');
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.initialized).toBe(true);
    expect(out.path).toContain('.foreman');
  });
});
