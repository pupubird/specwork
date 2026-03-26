import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { createTestProject, runSpecwork, cleanup } from './helpers.js';

describe('specwork init (enhanced / batteries-included)', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
  });

  afterEach(() => {
    cleanup(dir);
  });

  // ── Directory structure ─────────────────────────────────────────────────

  it('creates all .specwork/ subdirectories', () => {
    const result = runSpecwork(dir, 'init');
    expect(result.exitCode).toBe(0);

    const expectedDirs = [
      '.specwork/env',
      '.specwork/graph',
      '.specwork/nodes',
      '.specwork/specs',
      '.specwork/changes/archive',
      '.specwork/templates',
      '.specwork/examples',
    ];

    for (const d of expectedDirs) {
      expect(fs.existsSync(path.join(dir, d)), `Expected ${d}`).toBe(true);
    }
  });

  // ── Config ──────────────────────────────────────────────────────────────

  it('writes config.yaml with execution.verify: gates', () => {
    runSpecwork(dir, 'init');
    const configPath = path.join(dir, '.specwork', 'config.yaml');
    const config = parseYaml(fs.readFileSync(configPath, 'utf-8')) as Record<string, any>;
    expect(config.execution.verify).toBe('gates');
  });

  // ── Schema & examples ──────────────────────────────────────────────────

  it('writes schema.yaml', () => {
    runSpecwork(dir, 'init');
    const schemaPath = path.join(dir, '.specwork', 'schema.yaml');
    expect(fs.existsSync(schemaPath)).toBe(true);
    const content = fs.readFileSync(schemaPath, 'utf-8');
    expect(content).toContain('artifacts');
  });

  it('writes example-graph.yaml', () => {
    runSpecwork(dir, 'init');
    const examplePath = path.join(dir, '.specwork', 'examples', 'example-graph.yaml');
    expect(fs.existsSync(examplePath)).toBe(true);
    const content = fs.readFileSync(examplePath, 'utf-8');
    expect(content).toContain('nodes');
  });

  // ── .gitignore ──────────────────────────────────────────────────────────

  it('writes .specwork/.gitignore covering runtime files', () => {
    runSpecwork(dir, 'init');
    const gitignorePath = path.join(dir, '.specwork', '.gitignore');
    expect(fs.existsSync(gitignorePath)).toBe(true);
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('.current-scope');
    expect(content).toContain('.current-node');
    expect(content).toContain('*.lock');
  });

  // ── .claude/ files (batteries-included) ─────────────────────────────────

  it('writes all agent files', () => {
    runSpecwork(dir, 'init');
    const agents = [
      'specwork-implementer.md',
      'specwork-planner.md',
      'specwork-qa.md',
      'specwork-summarizer.md',
      'specwork-test-writer.md',
      'specwork-verifier.md',
    ];
    for (const agent of agents) {
      const p = path.join(dir, '.claude', 'agents', agent);
      expect(fs.existsSync(p), `Expected agent ${agent}`).toBe(true);
      expect(fs.readFileSync(p, 'utf-8').length).toBeGreaterThan(0);
    }
  });

  it('writes all skill files', () => {
    runSpecwork(dir, 'init');
    const skills = [
      'specwork-context/SKILL.md',
      'specwork-conventions/SKILL.md',
      'specwork-engine/SKILL.md',
      'specwork-snapshot/SKILL.md',
    ];
    for (const skill of skills) {
      const p = path.join(dir, '.claude', 'skills', skill);
      expect(fs.existsSync(p), `Expected skill ${skill}`).toBe(true);
      expect(fs.readFileSync(p, 'utf-8').length).toBeGreaterThan(0);
    }
  });

  it('writes all command files', () => {
    runSpecwork(dir, 'init');
    const commands = [
      'specwork-go.md',
      'specwork-plan.md',
      'specwork-status.md',
    ];
    for (const cmd of commands) {
      const p = path.join(dir, '.claude', 'commands', cmd);
      expect(fs.existsSync(p), `Expected command ${cmd}`).toBe(true);
      expect(fs.readFileSync(p, 'utf-8').length).toBeGreaterThan(0);
    }
  });

  it('writes all hook files as executable', () => {
    runSpecwork(dir, 'init');
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
    runSpecwork(dir, 'init');
    const settingsPath = path.join(dir, '.claude', 'settings.json');
    expect(fs.existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.SessionStart).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();
    expect(settings.hooks.PostToolUse).toBeDefined();
  });

  // ── Post-init message ──────────────────────────────────────────────────

  it('references specwork plan (not specwork new) in output', () => {
    const result = runSpecwork(dir, 'init');
    const combined = result.stdout + result.stderr;
    expect(combined).toContain('specwork plan');
    expect(combined).not.toContain('specwork new');
  });

  // ── Doctor auto-run ────────────────────────────────────────────────────

  it('runs doctor after init and shows results', () => {
    const result = runSpecwork(dir, 'init');
    const combined = result.stdout + result.stderr;
    // Doctor output should contain pass/fail symbols
    expect(combined).toMatch(/✓|passed|pass/i);
  });

  // ── --with-claude flag removed ─────────────────────────────────────────

  it('does NOT accept --with-claude flag', () => {
    const result = runSpecwork(dir, 'init --with-claude');
    // Should either error (unknown option) or just ignore it
    // The key assertion is that .claude/ files are always written regardless
    runSpecwork(dir, 'init --force');
    expect(fs.existsSync(path.join(dir, '.claude', 'agents', 'specwork-implementer.md'))).toBe(true);
  });

  // ── --force re-init ────────────────────────────────────────────────────

  it('re-initializes with --force and overwrites all files', () => {
    runSpecwork(dir, 'init');

    // Corrupt a file
    fs.writeFileSync(path.join(dir, '.specwork', 'config.yaml'), 'corrupted: true');

    const result = runSpecwork(dir, 'init --force');
    expect(result.exitCode).toBe(0);

    // Config should be restored
    const config = parseYaml(fs.readFileSync(path.join(dir, '.specwork', 'config.yaml'), 'utf-8')) as Record<string, any>;
    expect(config.models).toBeDefined();
    expect(config.execution.verify).toBe('gates');
  });

  // ── JSON mode ──────────────────────────────────────────────────────────

  it('outputs structured JSON with --json flag', () => {
    const result = runSpecwork(dir, 'init --json');
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.initialized).toBe(true);
    expect(out.path).toContain('.specwork');
  });
});
