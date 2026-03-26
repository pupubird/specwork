import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { createTestProject, runSpecwork, cleanup } from './helpers.js';

describe('specwork init', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
  });

  afterEach(() => {
    cleanup(dir);
  });

  it('creates .specwork/ with all required subdirectories', () => {
    const result = runSpecwork(dir, 'init');
    expect(result.exitCode).toBe(0);

    const expectedDirs = [
      '.specwork/env',
      '.specwork/graph',
      '.specwork/nodes',
      '.specwork/specs',
      '.specwork/changes/archive',
      '.specwork/templates',
    ];

    for (const d of expectedDirs) {
      expect(fs.existsSync(path.join(dir, d)), `Expected dir ${d} to exist`).toBe(true);
    }
  });

  it('creates config.yaml with valid content', () => {
    runSpecwork(dir, 'init');

    const configPath = path.join(dir, '.specwork', 'config.yaml');
    expect(fs.existsSync(configPath)).toBe(true);

    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = parseYaml(raw) as Record<string, unknown>;

    expect(config).toHaveProperty('models');
    expect(config).toHaveProperty('execution');
    expect(config).toHaveProperty('context');
    expect(config).toHaveProperty('spec');
    expect(config).toHaveProperty('graph');

    const models = config.models as Record<string, string>;
    expect(models.default).toBe('sonnet');
    expect(models.test_writer).toBe('opus');
    expect(models.summarizer).toBe('haiku');
    expect(models.verifier).toBe('haiku');
  });

  it('defaults parallel_mode to parallel', () => {
    runSpecwork(dir, 'init');

    const configPath = path.join(dir, '.specwork', 'config.yaml');
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = parseYaml(raw) as Record<string, unknown>;
    const execution = config.execution as Record<string, string>;

    expect(execution.parallel_mode).toBe('parallel');
  });

  it('creates 4 template files', () => {
    runSpecwork(dir, 'init');

    const templatesDir = path.join(dir, '.specwork', 'templates');
    const files = fs.readdirSync(templatesDir);

    expect(files).toHaveLength(4);
    expect(files).toContain('proposal.md');
    expect(files).toContain('design.md');
    expect(files).toContain('tasks.md');
    expect(files).toContain('spec.md');
  });

  it('creates .claude/ directories automatically (batteries-included)', () => {
    const result = runSpecwork(dir, 'init');
    expect(result.exitCode).toBe(0);

    const expectedClaudeDirs = [
      '.claude/agents',
      '.claude/skills',
      '.claude/commands',
      '.claude/hooks',
    ];

    for (const d of expectedClaudeDirs) {
      expect(fs.existsSync(path.join(dir, d)), `Expected .claude dir ${d} to exist`).toBe(true);
    }

    expect(fs.existsSync(path.join(dir, '.claude', 'settings.json'))).toBe(true);
  });

  it('warns and exits non-zero on re-init without --force', () => {
    // First init succeeds
    const first = runSpecwork(dir, 'init');
    expect(first.exitCode).toBe(0);

    // Second init without --force fails
    const second = runSpecwork(dir, 'init');
    expect(second.exitCode).not.toBe(0);
    expect(second.stderr + second.stdout).toMatch(/already exists/i);
  });

  it('re-initializes successfully with --force', () => {
    runSpecwork(dir, 'init');

    const result = runSpecwork(dir, 'init --force');
    expect(result.exitCode).toBe(0);

    // Dirs still exist after re-init
    expect(fs.existsSync(path.join(dir, '.specwork', 'config.yaml'))).toBe(true);
  });
});
