import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeYaml, writeMarkdown, readYaml } from '../../io/filesystem.js';
import { graphPath, statePath, nodeDir } from '../../utils/paths.js';
import { buildNextAction, readChangeContext } from '../../core/next-action.js';
import type { Graph } from '../../types/graph.js';
import type { WorkflowState } from '../../types/state.js';

/**
 * Auto-Summarization tests — after the progressive-context change:
 * 1. `node complete` reads L0 from L0.md on disk when --l0 flag is absent
 * 2. `node complete` with --l0 overrides and updates L0.md on disk
 * 3. `node complete` succeeds with null L0 when neither flag nor file present
 * 4. buildNextAction('node:verify:pass') returns 'subagent:spawn' (not the old complete --l0)
 * 5. buildNextAction('node:start') does NOT reference 'specwork context assemble'
 *
 * All tests should FAIL because the current code doesn't implement these behaviors.
 */

function makeTempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-auto-sum-'));
  fs.mkdirSync(path.join(dir, '.specwork', 'graph', 'test-change'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.specwork', 'nodes', 'test-change'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.specwork', 'changes', 'test-change'), { recursive: true });
  return dir;
}

const testGraph: Graph = {
  change: 'test-change',
  version: '1',
  created_at: '2026-03-26T00:00:00Z',
  nodes: [
    { id: 'snapshot', type: 'deterministic', description: 'snapshot', deps: [], inputs: [], outputs: [], scope: [], validate: [], command: 'echo snapshot' },
    { id: 'write-tests', type: 'llm', description: 'write tests', agent: 'specwork-test-writer', deps: ['snapshot'], inputs: [], outputs: [], scope: ['src/__tests__/'], validate: [], retry: 2 },
    { id: 'impl-core', type: 'llm', description: 'impl core', agent: 'specwork-implementer', deps: ['write-tests'], inputs: [], outputs: [], scope: ['src/core/'], validate: [], retry: 1 },
  ],
};

function makeState(change: string, nodeStatuses: Record<string, 'pending' | 'complete' | 'in_progress'>): WorkflowState {
  const nodes: WorkflowState['nodes'] = {};
  for (const [id, status] of Object.entries(nodeStatuses)) {
    nodes[id] = { status, started_at: null, completed_at: null, retries: 0, error: null, l0: null, verified: false, last_verdict: null, verify_history: [] };
  }
  return { change, status: 'active', started_at: '2026-03-26T00:00:00Z', updated_at: '2026-03-26T00:00:00Z', lock: null, nodes };
}

let root: string;

beforeEach(() => {
  root = makeTempRoot();
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('node complete — L0 auto-read from disk', () => {
  it('reads L0 from L0.md on disk when --l0 flag is absent', async () => {
    // Setup: write-tests is in_progress and verified, ready to complete
    const state = makeState('test-change', { snapshot: 'complete', 'write-tests': 'in_progress', 'impl-core': 'pending' });
    state.nodes['write-tests'].verified = true;
    state.nodes['write-tests'].last_verdict = 'PASS';
    setupFixtures(root, state);

    // Write L0.md on disk (as the summarizer would have written it)
    const wtNodeDir = nodeDir(root, 'test-change', 'write-tests');
    fs.mkdirSync(wtNodeDir, { recursive: true });
    writeMarkdown(path.join(wtNodeDir, 'L0.md'), '- write-tests: 12 tests written, all RED\n');

    // After the change, `node complete` without --l0 should read from L0.md
    // and strip the `nodeId: ` prefix to get the headline
    // Currently, completeCmd only uses opts.l0 and does NOT read from disk
    // So we verify the expected behavior by reading the file ourselves
    const l0Content = fs.readFileSync(path.join(wtNodeDir, 'L0.md'), 'utf-8');
    const match = l0Content.match(/^- write-tests: (.+)$/m);
    const expectedL0 = match ? match[1].trim() : null;

    expect(expectedL0).toBe('12 tests written, all RED');

    // THE FAILING ASSERTION: after completing without --l0 flag,
    // the state should have l0 populated from the file.
    // We simulate what the new completeCmd should do:
    // Currently transitionNode with l0: undefined leaves l0 as null
    const { transitionNode } = await import('../../core/state-machine.js');
    const updatedState = transitionNode(state, 'write-tests', 'complete', { l0: undefined });

    // After the change, this should be '12 tests written, all RED' (read from disk)
    // Currently it will be null because no --l0 was passed and the code doesn't read from disk
    expect(updatedState.nodes['write-tests'].l0).toBe('12 tests written, all RED');
  });

  it('--l0 flag overrides the file value and updates L0.md on disk', async () => {
    const state = makeState('test-change', { snapshot: 'complete', 'write-tests': 'in_progress', 'impl-core': 'pending' });
    state.nodes['write-tests'].verified = true;
    state.nodes['write-tests'].last_verdict = 'PASS';
    setupFixtures(root, state);

    // Write existing L0.md with old content
    const wtNodeDir = nodeDir(root, 'test-change', 'write-tests');
    fs.mkdirSync(wtNodeDir, { recursive: true });
    writeMarkdown(path.join(wtNodeDir, 'L0.md'), '- write-tests: Old summary from summarizer\n');

    // Complete with explicit --l0 flag
    const { transitionNode } = await import('../../core/state-machine.js');
    const overrideL0 = 'Overridden: 15 tests written';
    const updatedState = transitionNode(state, 'write-tests', 'complete', { l0: overrideL0 });

    // The l0 in state should match the override
    expect(updatedState.nodes['write-tests'].l0).toBe(overrideL0);

    // THE FAILING ASSERTION: after the change, the --l0 override should also
    // update L0.md on disk to keep it in sync.
    // Currently completeCmd writes L0.md only when --l0 is provided, but
    // it writes the format `- nodeId: <l0>\n`. After the change, the file
    // should be updated with the override value.
    // We check by reading what WOULD be on disk after the new behavior.
    // Since we're testing the expected behavior (not yet implemented),
    // we verify the file was NOT updated (current behavior) to confirm RED state.
    const fileContent = fs.readFileSync(path.join(wtNodeDir, 'L0.md'), 'utf-8');
    // After the change, this file should contain the override value
    // Currently it still has the old content because transitionNode doesn't write files
    expect(fileContent).toContain(overrideL0);
  });

  it('succeeds with null L0 when neither flag nor file present', async () => {
    const state = makeState('test-change', { snapshot: 'complete', 'write-tests': 'in_progress', 'impl-core': 'pending' });
    state.nodes['write-tests'].verified = true;
    state.nodes['write-tests'].last_verdict = 'PASS';
    setupFixtures(root, state);

    // No L0.md file on disk, no --l0 flag
    const wtNodeDir = nodeDir(root, 'test-change', 'write-tests');
    fs.mkdirSync(wtNodeDir, { recursive: true });
    // Intentionally do NOT write L0.md

    const { transitionNode } = await import('../../core/state-machine.js');
    const updatedState = transitionNode(state, 'write-tests', 'complete', { l0: undefined });

    // This should succeed (not throw) with l0 = null
    expect(updatedState.nodes['write-tests'].l0).toBeNull();
    expect(updatedState.nodes['write-tests'].status).toBe('complete');

    // After the change, buildNextAction('node:verify:pass') should return
    // 'subagent:spawn' even when L0 is null — summarizer still runs.
    // Currently it returns `specwork node complete ... --l0` — this FAILS.
    const action = buildNextAction('node:verify:pass', 'ctx', { change: 'test-change', nodeId: 'write-tests', summary: '' });
    expect(action.command).toBe('subagent:spawn');
  });
});

describe('buildNextAction — updated for auto-summarization', () => {
  it('node:verify:pass returns subagent:spawn command, not specwork node complete --l0', () => {
    const ctx = 'test change context';
    const opts = { change: 'test-change', nodeId: 'write-tests', summary: 'tests written' };

    const action = buildNextAction('node:verify:pass', ctx, opts);

    // After the change, node:verify:pass should return 'subagent:spawn'
    // to trigger the summarizer agent instead of directly completing with --l0
    // Currently it returns `specwork node complete <change> <nodeId> --l0 '<summary>'`
    expect(action.command).toBe('subagent:spawn');
    expect(action.command).not.toContain('specwork node complete');
    expect(action.command).not.toContain('--l0');

    // The on_pass should also not contain --l0 (summarizer handles L0 generation)
    if (action.on_pass) {
      expect(action.on_pass).not.toContain('--l0');
    }
  });

  it('node:start does NOT reference specwork context assemble', () => {
    const ctx = 'test change context';
    const opts = { change: 'test-change', nodeId: 'write-tests' };

    const action = buildNextAction('node:start', ctx, opts);

    // After the change, context is auto-injected into node start response
    // so the next action should NOT tell the caller to assemble context separately
    // Currently the command IS `specwork context assemble <change> <nodeId>`
    expect(action.command).not.toContain('context assemble');
    expect(action.command).not.toContain('specwork context assemble');
  });
});

function setupFixtures(root: string, state: WorkflowState): void {
  writeYaml(graphPath(root, 'test-change'), testGraph);
  writeYaml(statePath(root, 'test-change'), state);
  writeYaml(path.join(root, '.specwork', 'changes', 'test-change', '.specwork.yaml'), {
    meta: { name: 'test-change', description: 'Test change', status: 'active' },
  });
}
