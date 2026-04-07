/**
 * Tests for sandbox initialization — config resolution, service ordering, port checks, init lifecycle.
 *
 * Tests are written RED-first: sandbox-init.ts doesn't exist yet.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stringify as stringifyYaml } from 'yaml';

import {
  initSandbox,
  resolveConfig,
  checkPortConflicts,
  resolveServiceOrder,
  ensureSandbox,
  generateSandboxConfig,
} from '../../core/sandbox-init.js';
import type {
  SandboxConfig,
  SandboxService,
  SandboxState,
  SandboxChangeConfig,
} from '../../types/sandbox.js';

// ── helpers ──────────────────────────────────────────────────────────────────

let root: string;

function writeYaml(relPath: string, data: unknown): void {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, stringifyYaml(data), 'utf-8');
}

function writeFile(relPath: string, content: string): void {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

function readJson(relPath: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(root, relPath), 'utf-8'));
}

function makeBaseConfig(overrides?: Partial<SandboxConfig>): SandboxConfig {
  return {
    services: [
      { name: 'install-deps', run: 'npm install', when: 'if-missing', check: 'node_modules' },
    ],
    detect: { test_runner: 'auto', e2e_framework: 'auto', prompt_if_missing: false },
    ports: {} as any,
    env: { template: '.env.example', output: '.env.test', defaults: {} },
    teardown: {} as any,
    ...overrides,
  };
}

function setupSpecwork(change: string): void {
  fs.mkdirSync(path.join(root, '.specwork', 'sandbox'), { recursive: true });
  fs.mkdirSync(path.join(root, '.specwork', 'changes', change), { recursive: true });
}

// ── resolveServiceOrder ──────────────────────────────────────────────────────

describe('resolveServiceOrder', () => {
  it('scenario: Service dependency ordering via after field', () => {
    const services: SandboxService[] = [
      { name: 'seed', run: 'npm run seed', after: 'db' },
      { name: 'db', run: 'docker compose up -d postgres' },
      { name: 'install-deps', run: 'npm install' },
    ];

    const ordered = resolveServiceOrder(services);
    const names = ordered.map(s => s.name);

    const dbIndex = names.indexOf('db');
    const seedIndex = names.indexOf('seed');
    expect(dbIndex).toBeLessThan(seedIndex);
  });

  it('preserves order when no dependencies exist', () => {
    const services: SandboxService[] = [
      { name: 'a', run: 'echo a' },
      { name: 'b', run: 'echo b' },
      { name: 'c', run: 'echo c' },
    ];

    const ordered = resolveServiceOrder(services);
    expect(ordered.map(s => s.name)).toEqual(['a', 'b', 'c']);
  });

  it('handles multiple dependencies via after array', () => {
    const services: SandboxService[] = [
      { name: 'app', run: 'npm start', after: ['db', 'cache'] },
      { name: 'cache', run: 'redis-server' },
      { name: 'db', run: 'pg_ctl start' },
    ];

    const ordered = resolveServiceOrder(services);
    const names = ordered.map(s => s.name);
    expect(names.indexOf('db')).toBeLessThan(names.indexOf('app'));
    expect(names.indexOf('cache')).toBeLessThan(names.indexOf('app'));
  });

  it('throws on circular dependencies', () => {
    const services: SandboxService[] = [
      { name: 'a', run: 'echo a', after: 'b' },
      { name: 'b', run: 'echo b', after: 'a' },
    ];

    expect(() => resolveServiceOrder(services)).toThrow();
  });
});

// ── checkPortConflicts ───────────────────────────────────────────────────────

describe('checkPortConflicts', () => {
  it('scenario: Port available — returns no conflicts', async () => {
    // Use an unlikely-to-be-bound port
    const services: SandboxService[] = [
      { name: 'dev-server', run: 'npm run dev', ports: [59123] },
    ];

    const conflicts = await checkPortConflicts(services);
    expect(conflicts).toEqual([]);
  });

  it('scenario: Port already in use — reports conflict with PID', async () => {
    // Start a real server on a random port, then check for conflict
    const net = await import('node:net');
    const server = net.createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
    const port = (server.address() as any).port as number;

    try {
      const services: SandboxService[] = [
        { name: 'dev-server', run: 'npm run dev', ports: [port] },
      ];

      const conflicts = await checkPortConflicts(services);
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0]!.service).toBe('dev-server');
      expect(conflicts[0]!.port).toBe(port);
      expect(conflicts[0]!.pid).toBeGreaterThan(0);
    } finally {
      server.close();
    }
  });

  it('returns empty for services with no ports', async () => {
    const services: SandboxService[] = [
      { name: 'install-deps', run: 'npm install' },
    ];

    const conflicts = await checkPortConflicts(services);
    expect(conflicts).toEqual([]);
  });
});

// ── resolveConfig ────────────────────────────────────────────────────────────

describe('resolveConfig', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-sandbox-config-'));
    setupSpecwork('my-change');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('scenario: Skip a base service', async () => {
    const base = makeBaseConfig({
      services: [
        { name: 'install-deps', run: 'npm install' },
        { name: 'dev-server', run: 'npm run dev' },
        { name: 'db', run: 'docker compose up -d' },
      ],
    });
    writeYaml('.specwork/sandbox.yaml', base);

    const changeConfig: SandboxChangeConfig = {
      extends: 'base',
      skip: ['db'],
    };
    writeYaml('.specwork/changes/my-change/sandbox.yaml', changeConfig);

    const resolved = await resolveConfig(root, 'my-change');

    const names = resolved.services.map(s => s.name);
    expect(names).toContain('install-deps');
    expect(names).toContain('dev-server');
    expect(names).not.toContain('db');
  });

  it('scenario: Add a change-specific service', async () => {
    const base = makeBaseConfig({
      services: [
        { name: 'install-deps', run: 'npm install' },
        { name: 'db', run: 'docker compose up -d' },
      ],
    });
    writeYaml('.specwork/sandbox.yaml', base);

    const changeConfig: SandboxChangeConfig = {
      extends: 'base',
      services: [
        { name: 'seed-test-data', run: 'npm run seed', after: 'db' },
      ],
    };
    writeYaml('.specwork/changes/my-change/sandbox.yaml', changeConfig);

    const resolved = await resolveConfig(root, 'my-change');

    const names = resolved.services.map(s => s.name);
    expect(names).toContain('install-deps');
    expect(names).toContain('db');
    expect(names).toContain('seed-test-data');
  });

  it('scenario: Select a profile', async () => {
    const base = makeBaseConfig({
      profiles: {
        minimal: ['deps', 'docker'],
        full: ['deps', 'docker', 'webapp', 'solana'],
      },
      services: [
        { name: 'deps', run: 'npm install' },
        { name: 'docker', run: 'docker compose up -d' },
        { name: 'webapp', run: 'npm run dev:webapp' },
        { name: 'solana', run: 'solana-test-validator' },
      ],
    });
    writeYaml('.specwork/sandbox.yaml', base);

    const changeConfig: SandboxChangeConfig = {
      extends: 'base',
      profile: 'minimal',
    };
    writeYaml('.specwork/changes/my-change/sandbox.yaml', changeConfig);

    const resolved = await resolveConfig(root, 'my-change');

    const names = resolved.services.map(s => s.name);
    expect(names).toContain('deps');
    expect(names).toContain('docker');
    expect(names).not.toContain('webapp');
    expect(names).not.toContain('solana');
  });

  it('scenario: Default profile used when none specified', async () => {
    const base = makeBaseConfig({
      default_profile: 'backend',
      profiles: {
        backend: ['deps', 'docker', 'prisma'],
        frontend: ['deps', 'webapp'],
      },
      services: [
        { name: 'deps', run: 'npm install' },
        { name: 'docker', run: 'docker compose up -d' },
        { name: 'prisma', run: 'npx prisma migrate' },
        { name: 'webapp', run: 'npm run dev:web' },
      ],
    });
    writeYaml('.specwork/sandbox.yaml', base);

    const resolved = await resolveConfig(root, 'my-change');

    const names = resolved.services.map(s => s.name);
    expect(names).toContain('deps');
    expect(names).toContain('docker');
    expect(names).toContain('prisma');
    expect(names).not.toContain('webapp');
  });

  it('scenario: No profiles defined runs all services', async () => {
    const base = makeBaseConfig({
      services: [
        { name: 'a', run: 'echo a' },
        { name: 'b', run: 'echo b' },
        { name: 'c', run: 'echo c' },
      ],
    });
    writeYaml('.specwork/sandbox.yaml', base);

    const resolved = await resolveConfig(root, 'my-change');

    expect(resolved.services.map(s => s.name)).toEqual(['a', 'b', 'c']);
  });
});

// ── initSandbox ──────────────────────────────────────────────────────────────

describe('initSandbox', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-sandbox-init-'));
    setupSpecwork('my-change');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('scenario: Successful init with background service', async () => {
    const base = makeBaseConfig({
      services: [
        {
          name: 'dev-server',
          run: 'node -e "require(\'http\').createServer((q,s)=>{s.end(\'ok\')}).listen(0)"',
          background: true,
          ready_check: { command: 'echo ready', timeout: 5 },
        },
      ],
    });
    writeYaml('.specwork/sandbox.yaml', base);

    const state = await initSandbox(root, 'my-change');

    expect(state.change).toBe('my-change');
    expect(state.started_at).toBeDefined();
    expect(state.services.length).toBeGreaterThan(0);
    // State file should be written
    expect(fs.existsSync(path.join(root, '.specwork', 'sandbox', 'state.json'))).toBe(true);
  });

  it('scenario: Init with if-missing service (exists) — skip', async () => {
    // Create node_modules so the if-missing check passes
    fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });

    const base = makeBaseConfig({
      services: [
        { name: 'install-deps', run: 'npm install', when: 'if-missing', check: 'node_modules' },
      ],
    });
    writeYaml('.specwork/sandbox.yaml', base);

    const state = await initSandbox(root, 'my-change');

    // Service should be skipped (reused)
    const depsSvc = state.services.find(s => s.name === 'install-deps');
    expect(depsSvc).toBeDefined();
    expect(depsSvc!.status).toBe('stopped'); // skipped, not running
  });

  it('scenario: Init with if-missing service (missing) — execute', async () => {
    // Do NOT create node_modules
    const base = makeBaseConfig({
      services: [
        { name: 'install-deps', run: 'echo installed', when: 'if-missing', check: 'node_modules' },
      ],
    });
    writeYaml('.specwork/sandbox.yaml', base);

    const state = await initSandbox(root, 'my-change');

    const depsSvc = state.services.find(s => s.name === 'install-deps');
    expect(depsSvc).toBeDefined();
    // Should have run (not skipped)
    expect(depsSvc!.reused).not.toBe(true);
  });

  it('scenario: Dry run mode — no execution, no state file', async () => {
    const base = makeBaseConfig({
      services: [
        { name: 'db', run: 'docker compose up -d' },
      ],
    });
    writeYaml('.specwork/sandbox.yaml', base);

    const state = await initSandbox(root, 'my-change', { dryRun: true });

    // Should return a state-like object but NOT write state.json
    expect(state).toBeDefined();
    expect(fs.existsSync(path.join(root, '.specwork', 'sandbox', 'state.json'))).toBe(false);
  });

  // ── Multi-Workspace Support ────────────────────────────────────────────

  it('scenario: Service runs in workspace directory', async () => {
    fs.mkdirSync(path.join(root, 'backend'), { recursive: true });
    writeFile('backend/package.json', '{"name":"backend"}');

    const base = makeBaseConfig({
      workspaces: { backend: './backend' },
      services: [
        { name: 'backend-deps', run: 'echo installing', cwd: 'backend' },
      ],
    });
    writeYaml('.specwork/sandbox.yaml', base);

    const state = await initSandbox(root, 'my-change');

    expect(state.services.some(s => s.name === 'backend-deps')).toBe(true);
  });

  it('scenario: Multi-step service across workspaces', async () => {
    fs.mkdirSync(path.join(root, 'webapp'), { recursive: true });
    fs.mkdirSync(path.join(root, 'backend'), { recursive: true });

    const base = makeBaseConfig({
      workspaces: { webapp: './webapp', backend: './backend' },
      services: [
        {
          name: 'install-all',
          steps: [
            { run: 'echo install-backend', cwd: 'backend' },
            { run: 'echo install-webapp', cwd: 'webapp' },
          ],
        },
      ],
    });
    writeYaml('.specwork/sandbox.yaml', base);

    const state = await initSandbox(root, 'my-change');

    expect(state.services.some(s => s.name === 'install-all')).toBe(true);
  });

  // ── Output Capture ─────────────────────────────────────────────────────

  it('scenario: Capture stdout pattern — stored in state', async () => {
    const base = makeBaseConfig({
      services: [
        {
          name: 'deploy',
          run: 'echo "NEXT_PUBLIC_USDC_MINT=abc123def"',
          outputs: [
            { var: 'USDC_MINT', from: 'stdout', pattern: 'NEXT_PUBLIC_USDC_MINT=(.*)' },
          ],
        },
      ],
    });
    writeYaml('.specwork/sandbox.yaml', base);

    const state = await initSandbox(root, 'my-change');

    expect(state.captured_outputs).toBeDefined();
    expect(state.captured_outputs['USDC_MINT']).toBe('abc123def');
  });

  // ── Edge Cases ─────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('is idempotent — second init skips already-running services', async () => {
      const base = makeBaseConfig({
        services: [
          { name: 'echo-svc', run: 'echo hello' },
        ],
      });
      writeYaml('.specwork/sandbox.yaml', base);

      const state1 = await initSandbox(root, 'my-change');
      const state2 = await initSandbox(root, 'my-change');

      expect(state2).toBeDefined();
      expect(state2.change).toBe('my-change');
    });

    it('throws when no sandbox.yaml exists', async () => {
      // No config file
      await expect(initSandbox(root, 'my-change')).rejects.toThrow();
    });

    it('handles profile override from options', async () => {
      const base = makeBaseConfig({
        profiles: {
          minimal: ['deps'],
          full: ['deps', 'db'],
        },
        services: [
          { name: 'deps', run: 'npm install' },
          { name: 'db', run: 'docker compose up -d' },
        ],
      });
      writeYaml('.specwork/sandbox.yaml', base);

      const state = await initSandbox(root, 'my-change', { profile: 'minimal' });

      const names = state.services.map(s => s.name);
      expect(names).toContain('deps');
      expect(names).not.toContain('db');
    });
  });
});

// ── generateSandboxConfig ───────────────────────────────────────────────────

describe('generateSandboxConfig', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-sandbox-gen-'));
    fs.mkdirSync(path.join(root, '.specwork'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('auto-detects node project and writes sandbox.yaml', async () => {
    writeFile('package.json', JSON.stringify({
      name: 'test-project',
      devDependencies: { vitest: '^1.0.0' },
    }));

    const config = await generateSandboxConfig(root);

    expect(config.services.length).toBeGreaterThan(0);
    expect(config.detect.test_runner).toBe('vitest');
    expect(fs.existsSync(path.join(root, '.specwork', 'sandbox.yaml'))).toBe(true);
  });

  it('detects package manager from lock file', async () => {
    writeFile('package.json', JSON.stringify({ name: 'test' }));
    writeFile('pnpm-lock.yaml', '');

    const config = await generateSandboxConfig(root);

    expect(config).toBeDefined();
    expect(fs.existsSync(path.join(root, '.specwork', 'sandbox.yaml'))).toBe(true);
  });
});

// ── ensureSandbox ───────────────────────────────────────────────────────────

describe('ensureSandbox', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-sandbox-ensure-'));
    setupSpecwork('my-change');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('initializes sandbox when no state exists', async () => {
    const base = makeBaseConfig({
      services: [{ name: 'echo-svc', run: 'echo hello' }],
    });
    writeYaml('.specwork/sandbox.yaml', base);

    const result = await ensureSandbox(root, 'my-change');

    expect(result.initialized).toBe(true);
    expect(result.state).not.toBeNull();
    expect(result.state!.change).toBe('my-change');
    expect(fs.existsSync(path.join(root, '.specwork', 'sandbox', 'state.json'))).toBe(true);
  });

  it('skips init when sandbox state already exists', async () => {
    const base = makeBaseConfig({
      services: [{ name: 'echo-svc', run: 'echo hello' }],
    });
    writeYaml('.specwork/sandbox.yaml', base);

    // First call — initializes
    await ensureSandbox(root, 'my-change');

    // Second call — should skip
    const result = await ensureSandbox(root, 'my-change');

    expect(result.initialized).toBe(false);
    expect(result.state).not.toBeNull();
  });

  it('auto-generates sandbox.yaml when missing and then initializes', async () => {
    // No sandbox.yaml, but provide a package.json for detection
    writeFile('package.json', JSON.stringify({
      name: 'test-project',
      devDependencies: { vitest: '^1.0.0' },
    }));
    // Create node_modules so install-deps is skipped
    fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });

    const result = await ensureSandbox(root, 'my-change');

    expect(result.initialized).toBe(true);
    expect(fs.existsSync(path.join(root, '.specwork', 'sandbox.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.specwork', 'sandbox', 'state.json'))).toBe(true);
  });
});
