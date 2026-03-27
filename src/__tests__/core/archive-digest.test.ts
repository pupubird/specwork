import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeYaml, writeMarkdown } from '../../io/filesystem.js';
import { graphPath, statePath, nodeDir, changeDir, archiveChangeDir } from '../../utils/paths.js';
import { archiveChange } from '../../core/archive.js';
import type { Graph } from '../../types/graph.js';
import type { WorkflowState } from '../../types/state.js';

/**
 * Archive Digest tests — after the progressive-context change:
 * 1. archiveChange writes `digest.md` NOT `summary.md`
 * 2. Digest contains "Node Timeline" section with L0 headlines
 * 3. Digest contains "Node Details" section with L1 content for nodes with L1.md
 * 4. Digest omits nodes without L1.md from "Node Details" (but they appear in timeline)
 * 5. Digest contains "Verification Summary" table with verdict per node
 * 6. Digest does NOT include L2 content
 *
 * All tests should FAIL because archiveChange currently writes summary.md, not digest.md.
 */

function makeTempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-digest-'));
  fs.mkdirSync(path.join(dir, '.specwork', 'graph', 'test-change'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.specwork', 'nodes', 'test-change'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.specwork', 'changes', 'test-change'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.specwork', 'changes', 'archive'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.specwork', 'specs'), { recursive: true });
  return dir;
}

const testGraph: Graph = {
  change: 'test-change',
  version: '1',
  created_at: '2026-03-26T00:00:00Z',
  nodes: [
    { id: 'snapshot', type: 'deterministic', description: 'Environment snapshot', deps: [], inputs: [], outputs: [], scope: [], validate: [], command: 'echo snapshot' },
    { id: 'write-tests', type: 'llm', description: 'Write tests', agent: 'specwork-test-writer', deps: ['snapshot'], inputs: [], outputs: [], scope: ['src/__tests__/'], validate: [], retry: 2 },
    { id: 'impl-core', type: 'llm', description: 'Implement core', agent: 'specwork-implementer', deps: ['write-tests'], inputs: [], outputs: [], scope: ['src/core/'], validate: [], retry: 1 },
  ],
};

function makeCompleteState(change: string): WorkflowState {
  return {
    change,
    status: 'complete',
    started_at: '2026-03-26T00:00:00Z',
    updated_at: '2026-03-26T12:00:00Z',
    lock: null,
    nodes: {
      'snapshot': { status: 'complete', started_at: '2026-03-26T00:01:00Z', completed_at: '2026-03-26T00:02:00Z', retries: 0, error: null, l0: 'Environment snapshot captured', verified: true, last_verdict: 'PASS', verify_history: [] },
      'write-tests': { status: 'complete', started_at: '2026-03-26T00:03:00Z', completed_at: '2026-03-26T00:10:00Z', retries: 0, error: null, l0: '12 tests written, all RED', verified: true, last_verdict: 'PASS', verify_history: [] },
      'impl-core': { status: 'complete', started_at: '2026-03-26T00:11:00Z', completed_at: '2026-03-26T00:20:00Z', retries: 1, error: null, l0: 'Archive digest implemented', verified: true, last_verdict: 'PASS', verify_history: [] },
    },
  };
}

function setupArchiveFixtures(root: string): void {
  const state = makeCompleteState('test-change');
  writeYaml(graphPath(root, 'test-change'), testGraph);
  writeYaml(statePath(root, 'test-change'), state);

  // tasks.md with all tasks checked off (required for archive to succeed)
  writeMarkdown(path.join(changeDir(root, 'test-change'), 'tasks.md'), '## Group 1\n- [x] Task 1\n- [x] Task 2\n');

  // .specwork.yaml for the change
  writeYaml(path.join(changeDir(root, 'test-change'), '.specwork.yaml'), {
    meta: { name: 'test-change', description: 'Test change for digest', status: 'active' },
  });

  // Write L0.md files for each node
  for (const [nodeId, headline] of [['snapshot', 'Environment snapshot captured'], ['write-tests', '12 tests written, all RED'], ['impl-core', 'Archive digest implemented']]) {
    const nDir = nodeDir(root, 'test-change', nodeId);
    fs.mkdirSync(nDir, { recursive: true });
    writeMarkdown(path.join(nDir, 'L0.md'), `- ${nodeId}: ${headline}\n`);
  }

  // Write L1.md for write-tests and impl-core (but NOT for snapshot)
  writeMarkdown(path.join(nodeDir(root, 'test-change', 'write-tests'), 'L1.md'),
    '## write-tests\nFiles: src/__tests__/core/archive-digest.test.ts\nExports: 12 test cases\nDecisions: Used vitest describe blocks\n');
  writeMarkdown(path.join(nodeDir(root, 'test-change', 'impl-core'), 'L1.md'),
    '## impl-core\nFiles: src/core/archive.ts\nExports: archiveChange, buildDigest\nDecisions: Replaced summary.md with digest.md\n');

  // Write L2.md for impl-core (should NOT appear in digest)
  writeMarkdown(path.join(nodeDir(root, 'test-change', 'impl-core'), 'L2.md'),
    '## Full Diff\n```diff\n+ function buildDigest() {\n+   // implementation\n+ }\n```\n');
}

let root: string;

beforeEach(() => {
  root = makeTempRoot();
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('archiveChange — digest.md', () => {
  it('writes digest.md NOT summary.md', () => {
    setupArchiveFixtures(root);
    archiveChange(root, 'test-change');

    const archiveDir = archiveChangeDir(root, 'test-change');

    // After the change, archive should write digest.md instead of summary.md
    // Currently archiveChange writes summary.md — so this FAILS
    expect(fs.existsSync(path.join(archiveDir, 'digest.md'))).toBe(true);
    expect(fs.existsSync(path.join(archiveDir, 'summary.md'))).toBe(false);
  });

  it('digest contains "Node Timeline" section with L0 headlines per node', () => {
    setupArchiveFixtures(root);
    archiveChange(root, 'test-change');

    const archiveDir = archiveChangeDir(root, 'test-change');

    // After the change, digest.md should have a "Node Timeline" section
    // Currently summary.md has different sections — this FAILS
    const digestPath = path.join(archiveDir, 'digest.md');
    // Fallback: try reading digest.md, if not found try summary.md (to verify it doesn't have the new format)
    const digestExists = fs.existsSync(digestPath);
    const content = digestExists
      ? fs.readFileSync(digestPath, 'utf-8')
      : '';

    expect(content).toContain('## Node Timeline');
    expect(content).toContain('snapshot');
    expect(content).toContain('Environment snapshot captured');
    expect(content).toContain('write-tests');
    expect(content).toContain('12 tests written, all RED');
    expect(content).toContain('impl-core');
    expect(content).toContain('Archive digest implemented');
  });

  it('digest contains "Node Details" section with L1 content for nodes that have L1.md', () => {
    setupArchiveFixtures(root);
    archiveChange(root, 'test-change');

    const archiveDir = archiveChangeDir(root, 'test-change');
    const digestPath = path.join(archiveDir, 'digest.md');
    const digestExists = fs.existsSync(digestPath);
    const content = digestExists
      ? fs.readFileSync(digestPath, 'utf-8')
      : '';

    // Digest should have "Node Details" with L1 content
    expect(content).toContain('## Node Details');
    expect(content).toContain('write-tests');
    expect(content).toContain('12 test cases');
    expect(content).toContain('impl-core');
    expect(content).toContain('archiveChange, buildDigest');
  });

  it('digest omits nodes without L1.md from "Node Details" but they appear in timeline', () => {
    setupArchiveFixtures(root);
    archiveChange(root, 'test-change');

    const archiveDir = archiveChangeDir(root, 'test-change');
    const digestPath = path.join(archiveDir, 'digest.md');
    const digestExists = fs.existsSync(digestPath);
    const content = digestExists
      ? fs.readFileSync(digestPath, 'utf-8')
      : '';

    // snapshot node has L0 but no L1 — should appear in timeline but not in details
    const timelineSection = content.split('## Node Details')[0] || '';
    const detailsSection = content.split('## Node Details')[1] || '';

    // snapshot appears in timeline
    expect(timelineSection).toContain('## Node Timeline');
    expect(timelineSection).toContain('snapshot');

    // snapshot does NOT appear in node details (no L1.md for it)
    // We check that the details section doesn't have a snapshot subsection
    // The details section should only have write-tests and impl-core
    expect(detailsSection).not.toMatch(/###\s+snapshot/);
  });

  it('digest contains "Verification Summary" table with verdict per node', () => {
    setupArchiveFixtures(root);
    archiveChange(root, 'test-change');

    const archiveDir = archiveChangeDir(root, 'test-change');
    const digestPath = path.join(archiveDir, 'digest.md');
    const digestExists = fs.existsSync(digestPath);
    const content = digestExists
      ? fs.readFileSync(digestPath, 'utf-8')
      : '';

    // Digest should have a "Verification Summary" section with a table
    expect(content).toContain('## Verification Summary');
    // Table should have columns for node and verdict
    expect(content).toMatch(/\|\s*Node\s*\|.*Verdict/i);
    // Each node should have PASS verdict
    expect(content).toContain('snapshot');
    expect(content).toContain('PASS');
    expect(content).toContain('write-tests');
    expect(content).toContain('impl-core');
  });

  it('digest does NOT include L2 content (full diffs)', () => {
    setupArchiveFixtures(root);
    archiveChange(root, 'test-change');

    const archiveDir = archiveChangeDir(root, 'test-change');
    const digestPath = path.join(archiveDir, 'digest.md');
    const digestExists = fs.existsSync(digestPath);
    const content = digestExists
      ? fs.readFileSync(digestPath, 'utf-8')
      : '';

    // After the change, digest.md should exist (not summary.md)
    // This is the primary failing assertion — digest.md doesn't exist yet
    expect(fs.existsSync(path.join(archiveDir, 'digest.md'))).toBe(true);

    // L2 content (full diffs) should NOT appear in digest
    expect(content).not.toContain('Full Diff');
    expect(content).not.toContain('function buildDigest');
    expect(content).not.toContain('```diff');
  });
});
