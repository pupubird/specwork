/**
 * Tests for sandbox CLI subcommands (init, teardown, status, detect) and engine integration.
 *
 * Tests are written RED-first: cli/sandbox.ts doesn't exist yet.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { createTestProject, runSpecwork, cleanup } from '../integration/helpers.js';

import { makeSandboxCommand } from '../../cli/sandbox.js';

// ── helpers ──────────────────────────────────────────────────────────────────

let dir: string;

function writeSandboxYaml(root: string, config: Record<string, unknown>): void {
  const configPath = path.join(root, '.specwork', 'sandbox.yaml');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, stringifyYaml(config), 'utf-8');
}

function writeStateJson(root: string, state: Record<string, unknown>): void {
  const stateDir = path.join(root, '.specwork', 'sandbox');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify(state, null, 2), 'utf-8');
}

function baseSandboxConfig(): Record<string, unknown> {
  return {
    services: [
      { name: 'install-deps', run: 'echo installed', when: 'always' },
    ],
    detect: { test_runner: 'auto', e2e_framework: 'auto', prompt_if_missing: false },
    env: { template: '.env.example', output: '.env.test', defaults: {} },
    teardown: {},
  };
}

// ── makeSandboxCommand ───────────────────────────────────────────────────────

describe('makeSandboxCommand', () => {
  it('returns a Commander Command instance', () => {
    const cmd = makeSandboxCommand();
    expect(cmd).toBeDefined();
    expect(cmd.name()).toBe('sandbox');
  });

  it('has init, teardown, status, and detect subcommands', () => {
    const cmd = makeSandboxCommand();
    const subcommandNames = cmd.commands.map((c: any) => c.name());
    expect(subcommandNames).toContain('init');
    expect(subcommandNames).toContain('teardown');
    expect(subcommandNames).toContain('status');
    expect(subcommandNames).toContain('detect');
  });
});

// ── CLI Integration Tests ────────────────────────────────────────────────────

describe('specwork sandbox CLI', () => {
  beforeEach(() => {
    dir = createTestProject();
    runSpecwork(dir, 'init');
    writeSandboxYaml(dir, baseSandboxConfig());
  });

  afterEach(() => {
    cleanup(dir);
  });

  // ── Scenario: sandbox init with change name ────────────────────────────

  it('scenario: sandbox init with change name', () => {
    runSpecwork(dir, 'new my-change');

    const result = runSpecwork(dir, 'sandbox init my-change --json');

    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.success).toBe(true);
    expect(out.services).toBeDefined();
    expect(Array.isArray(out.services)).toBe(true);
  });

  // ── Scenario: sandbox init with dry-run ────────────────────────────────

  it('scenario: sandbox init with dry-run', () => {
    const result = runSpecwork(dir, 'sandbox init --dry-run --json');

    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout);
    // Dry run should not write state file
    expect(
      fs.existsSync(path.join(dir, '.specwork', 'sandbox', 'state.json')),
    ).toBe(false);
  });

  // ── Scenario: sandbox teardown ─────────────────────────────────────────

  it('scenario: sandbox teardown', () => {
    // Create a fake state file
    writeStateJson(dir, {
      change: 'my-change',
      profile: 'default',
      started_at: new Date().toISOString(),
      services: [],
      captured_outputs: {},
    });

    const result = runSpecwork(dir, 'sandbox teardown my-change --json');

    expect(result.exitCode).toBe(0);
  });

  // ── Scenario: sandbox status ───────────────────────────────────────────

  it('scenario: sandbox status', () => {
    // Create a fake state file
    writeStateJson(dir, {
      change: 'my-change',
      profile: 'default',
      started_at: new Date().toISOString(),
      services: [
        { name: 'dev-server', pid: 12345, port: 3000, status: 'running' },
      ],
      captured_outputs: {},
    });

    const result = runSpecwork(dir, 'sandbox status --json');

    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.services).toBeDefined();
  });

  // ── Scenario: sandbox detect ───────────────────────────────────────────

  it('scenario: sandbox detect', () => {
    // Write a package.json for detection
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'test', devDependencies: { vitest: '1.0.0' } }),
      'utf-8',
    );

    const result = runSpecwork(dir, 'sandbox detect --json');

    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.project_type).toBeDefined();
    expect(out.test_runner).toBeDefined();
  });

  // ── JSON Output Mode ──────────────────────────────────────────────────

  describe('JSON Output Mode', () => {
    it('scenario: JSON mode for sandbox init', () => {
      runSpecwork(dir, 'new my-change');

      const result = runSpecwork(dir, 'sandbox init my-change --json');

      expect(result.exitCode).toBe(0);
      const out = JSON.parse(result.stdout);
      expect(out).toHaveProperty('success');
      expect(out).toHaveProperty('services');
      expect(out).toHaveProperty('state_file');
    });

    it('scenario: JSON mode for sandbox detect', () => {
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ name: 'test', devDependencies: {} }),
        'utf-8',
      );

      const result = runSpecwork(dir, 'sandbox detect --json');

      expect(result.exitCode).toBe(0);
      const out = JSON.parse(result.stdout);
      // Should be a full DetectionResult
      expect(out).toHaveProperty('project_type');
      expect(out).toHaveProperty('has_docker');
      expect(out).toHaveProperty('detected_services');
    });
  });
});

// ── Engine Integration Tests ─────────────────────────────────────────────────

describe('Engine State Machine Sandbox Steps', () => {
  let skillContent: string;

  beforeEach(() => {
    const skillPath = path.join(
      process.cwd(),
      '.claude',
      'skills',
      'specwork-engine',
      'SKILL.md',
    );
    skillContent = fs.readFileSync(skillPath, 'utf-8');
  });

  it('scenario: Sandbox init before subagent spawn — state machine has sandbox init row', () => {
    // The engine SKILL.md should have a row for sandbox init between node:start and subagent:spawn
    expect(skillContent).toContain('sandbox init');
    expect(skillContent).toContain('specwork sandbox init');
  });

  it('scenario: Init failure blocks subagent — state machine documents failure behavior', () => {
    // The SKILL.md should document that sandbox init failure prevents subagent spawn
    expect(skillContent).toMatch(/sandbox.*init.*fail/i);
  });

  it('scenario: Sandbox teardown after verification — state machine has sandbox teardown row', () => {
    // The engine SKILL.md should have a row for sandbox teardown after verify
    expect(skillContent).toContain('sandbox teardown');
    expect(skillContent).toContain('specwork sandbox teardown');
  });

  it('scenario: Sandbox teardown failure is non-fatal — state machine documents warning behavior', () => {
    // The SKILL.md should document that teardown failure is non-fatal (warning only)
    expect(skillContent).toMatch(/teardown.*warn|teardown.*non-fatal|teardown.*continue/i);
  });
});
