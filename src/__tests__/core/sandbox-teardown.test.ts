/**
 * Tests for sandbox teardown — kills tracked PIDs, runs teardown commands, cleans state.
 *
 * Tests are written RED-first: sandbox-teardown.ts doesn't exist yet.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { teardownSandbox } from '../../core/sandbox-teardown.js';
import type { SandboxState, ServiceState } from '../../types/sandbox.js';

// ── helpers ──────────────────────────────────────────────────────────────────

let root: string;

function writeStateJson(state: SandboxState): void {
  const stateDir = path.join(root, '.specwork', 'sandbox');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify(state, null, 2), 'utf-8');
}

function stateFileExists(): boolean {
  return fs.existsSync(path.join(root, '.specwork', 'sandbox', 'state.json'));
}

function makeState(services: ServiceState[], change = 'my-change'): SandboxState {
  return {
    change,
    profile: 'default',
    started_at: new Date().toISOString(),
    services,
    captured_outputs: {},
  };
}

// ── Sandbox Teardown ─────────────────────────────────────────────────────────

describe('teardownSandbox', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-sandbox-teardown-'));
    fs.mkdirSync(path.join(root, '.specwork', 'sandbox'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  // ── Scenario: Clean teardown of background services ────────────────────

  it('scenario: Clean teardown — SIGTERM tracked PIDs and remove state.json', async () => {
    // Spawn real background processes to track
    const { execSync } = await import('node:child_process');
    // Start two sleep processes as fake services
    const proc1 = await import('node:child_process').then(cp =>
      cp.spawn('sleep', ['60'], { detached: true, stdio: 'ignore' }),
    );
    const proc2 = await import('node:child_process').then(cp =>
      cp.spawn('sleep', ['60'], { detached: true, stdio: 'ignore' }),
    );
    proc1.unref();
    proc2.unref();

    const state = makeState([
      { name: 'svc1', pid: proc1.pid!, port: 3000, status: 'running' },
      { name: 'svc2', pid: proc2.pid!, port: 5432, status: 'running' },
    ]);
    writeStateJson(state);

    await teardownSandbox(root, 'my-change');

    // State file should be removed
    expect(stateFileExists()).toBe(false);

    // Processes should be terminated
    const isAlive = (pid: number): boolean => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    // Give a moment for SIGTERM
    await new Promise(r => setTimeout(r, 100));
    expect(isAlive(proc1.pid!)).toBe(false);
    expect(isAlive(proc2.pid!)).toBe(false);
  });

  // ── Scenario: Teardown with already-exited processes ───────────────────

  it('scenario: Already-exited processes — skip dead PID without error', async () => {
    // Use a PID that definitely doesn't exist
    const state = makeState([
      { name: 'dead-svc', pid: 999999, port: 3000, status: 'running' },
    ]);
    writeStateJson(state);

    // Should NOT throw
    await teardownSandbox(root, 'my-change');

    expect(stateFileExists()).toBe(false);
  });

  // ── Scenario: Teardown without state file ──────────────────────────────

  it('scenario: No state file — exit cleanly with message', async () => {
    // Don't write any state file

    // Should NOT throw
    await teardownSandbox(root, 'my-change');
  });

  // ── Edge Cases ─────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('handles state with empty services array', async () => {
      const state = makeState([]);
      writeStateJson(state);

      await teardownSandbox(root, 'my-change');

      expect(stateFileExists()).toBe(false);
    });

    it('handles services with no PID (non-background)', async () => {
      const state = makeState([
        { name: 'install-deps', status: 'stopped' },
      ]);
      writeStateJson(state);

      // Should not throw — just skip services without PIDs
      await teardownSandbox(root, 'my-change');

      expect(stateFileExists()).toBe(false);
    });

    it('handles malformed state.json gracefully', async () => {
      const stateDir = path.join(root, '.specwork', 'sandbox');
      fs.writeFileSync(path.join(stateDir, 'state.json'), '{ broken json!!!', 'utf-8');

      // Should handle gracefully (either throw with good message or recover)
      await expect(teardownSandbox(root, 'my-change')).rejects.toThrow();
    });

    it('removes state file even when no processes to kill', async () => {
      const state = makeState([
        { name: 'svc', status: 'stopped' },
      ]);
      writeStateJson(state);

      await teardownSandbox(root, 'my-change');

      expect(stateFileExists()).toBe(false);
    });
  });
});
