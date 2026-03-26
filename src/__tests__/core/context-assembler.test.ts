import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stringifyYaml } from '../../io/yaml.js';
import {
  getL0All,
  getL1,
  getL2,
  assembleContext,
  renderContext,
} from '../../core/context-assembler.js';
import type { Graph } from '../../types/graph.js';
import type { WorkflowState } from '../../types/state.js';
import type { ContextBundle } from '../../types/context.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeTmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'foreman-test-'));
}

function makeNodeDir(root: string, change: string, nodeId: string): string {
  const dir = path.join(root, '.foreman', 'nodes', change, nodeId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function makeGraph(change: string, nodes: Graph['nodes']): Graph {
  return { change, version: '1', created_at: '2026-03-26T00:00:00Z', nodes };
}

function makeState(change: string, nodeStatuses: Record<string, 'pending' | 'complete' | 'in_progress'>): WorkflowState {
  const nodes: WorkflowState['nodes'] = {};
  for (const [id, status] of Object.entries(nodeStatuses)) {
    nodes[id] = { status, started_at: null, completed_at: null, retries: 0, error: null, l0: null };
  }
  return {
    change,
    status: 'active',
    started_at: '2026-03-26T00:00:00Z',
    updated_at: '2026-03-26T00:00:00Z',
    lock: null,
    nodes,
  };
}

// ── getL0All ──────────────────────────────────────────────────────────────────

describe('getL0All', () => {
  let root: string;

  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('returns empty array when nodes dir does not exist', () => {
    const entries = getL0All(root, 'my-change');
    expect(entries).toEqual([]);
  });

  it('reads a single L0 file', () => {
    const dir = makeNodeDir(root, 'my-change', 'snapshot');
    writeFile(path.join(dir, 'L0.md'), 'snapshot: complete, env captured');

    const entries = getL0All(root, 'my-change');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ nodeId: 'snapshot', headline: 'snapshot: complete, env captured' });
  });

  it('reads multiple L0 files across nodes', () => {
    const dir1 = makeNodeDir(root, 'ch', 'snapshot');
    const dir2 = makeNodeDir(root, 'ch', 'write-tests');
    writeFile(path.join(dir1, 'L0.md'), 'snapshot: complete');
    writeFile(path.join(dir2, 'L0.md'), 'write-tests: complete, 5 tests written');

    const entries = getL0All(root, 'ch');
    const ids = entries.map(e => e.nodeId).sort();
    expect(ids).toEqual(['snapshot', 'write-tests'].sort());
  });

  it('skips node dirs without L0.md', () => {
    const dir = makeNodeDir(root, 'ch', 'snapshot');
    // no L0.md written — only the directory exists
    fs.writeFileSync(path.join(dir, 'L1.md'), 'some content', 'utf8');

    const entries = getL0All(root, 'ch');
    expect(entries).toHaveLength(0);
  });

  it('skips empty L0 files', () => {
    const dir = makeNodeDir(root, 'ch', 'snapshot');
    writeFile(path.join(dir, 'L0.md'), '   \n  ');

    const entries = getL0All(root, 'ch');
    expect(entries).toHaveLength(0);
  });
});

// ── getL1 ─────────────────────────────────────────────────────────────────────

describe('getL1', () => {
  let root: string;

  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('returns L1 content when file exists', () => {
    const dir = makeNodeDir(root, 'ch', 'snapshot');
    writeFile(path.join(dir, 'L1.md'), '## Snapshot\nFiles: 42\nExports: 10');

    const content = getL1(root, 'ch', 'snapshot');
    expect(content).toContain('Files: 42');
  });

  it('returns empty string when L1 file does not exist', () => {
    makeNodeDir(root, 'ch', 'snapshot');
    const content = getL1(root, 'ch', 'snapshot');
    expect(content).toBe('');
  });
});

// ── getL2 ─────────────────────────────────────────────────────────────────────

describe('getL2', () => {
  let root: string;

  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('returns L2 content when file exists', () => {
    const dir = makeNodeDir(root, 'ch', 'impl-core');
    writeFile(path.join(dir, 'L2.md'), '## Full Diff\n+++ added lines');

    const content = getL2(root, 'ch', 'impl-core');
    expect(content).toContain('+++ added lines');
  });

  it('returns empty string when L2 file does not exist', () => {
    makeNodeDir(root, 'ch', 'impl-core');
    const content = getL2(root, 'ch', 'impl-core');
    expect(content).toBe('');
  });
});

// ── assembleContext ───────────────────────────────────────────────────────────

describe('assembleContext', () => {
  let root: string;

  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  function setupChange(
    change: string,
    graph: Graph,
    state: WorkflowState,
    l0Map: Record<string, string> = {},
    l1Map: Record<string, string> = {},
    snapshot = ''
  ): void {
    const graphDir = path.join(root, '.foreman', 'graph', change);
    fs.mkdirSync(graphDir, { recursive: true });
    fs.writeFileSync(path.join(graphDir, 'graph.yaml'), stringifyYaml(graph), 'utf8');
    fs.writeFileSync(path.join(graphDir, 'state.yaml'), stringifyYaml(state), 'utf8');

    for (const [nodeId, headline] of Object.entries(l0Map)) {
      const dir = makeNodeDir(root, change, nodeId);
      writeFile(path.join(dir, 'L0.md'), headline);
    }
    for (const [nodeId, content] of Object.entries(l1Map)) {
      const dir = makeNodeDir(root, change, nodeId);
      writeFile(path.join(dir, 'L1.md'), content);
    }

    if (snapshot) {
      const snapDir = path.join(root, '.foreman', 'env');
      fs.mkdirSync(snapDir, { recursive: true });
      fs.writeFileSync(path.join(snapDir, 'snapshot.md'), snapshot, 'utf8');
    }
  }

  it('returns empty l0 when no nodes complete', () => {
    const graph = makeGraph('ch', [
      { id: 'snapshot', type: 'deterministic', description: 'snap', deps: [], inputs: [], outputs: [], scope: [], validate: [], command: 'echo' },
      { id: 'write-tests', type: 'llm', description: 'tests', agent: 'foreman-test-writer', deps: ['snapshot'], inputs: [], outputs: [], scope: [], validate: [] },
    ]);
    const state = makeState('ch', { snapshot: 'pending', 'write-tests': 'pending' });
    setupChange('ch', graph, state);

    const bundle = assembleContext(root, 'ch', 'write-tests');
    expect(bundle.l0).toHaveLength(0);
  });

  it('includes L0 only for completed nodes', () => {
    const graph = makeGraph('ch', [
      { id: 'snapshot', type: 'deterministic', description: 'snap', deps: [], inputs: [], outputs: [], scope: [], validate: [], command: 'echo' },
      { id: 'write-tests', type: 'llm', description: 'tests', agent: 'foreman-test-writer', deps: ['snapshot'], inputs: [], outputs: [], scope: [], validate: [] },
    ]);
    const state = makeState('ch', { snapshot: 'complete', 'write-tests': 'pending' });
    setupChange('ch', graph, state, { snapshot: 'snapshot: complete, env captured' });

    const bundle = assembleContext(root, 'ch', 'write-tests');
    expect(bundle.l0).toHaveLength(1);
    expect(bundle.l0[0].nodeId).toBe('snapshot');
  });

  it('includes L1 only for direct parents', () => {
    const graph = makeGraph('ch', [
      { id: 'snapshot', type: 'deterministic', description: 'snap', deps: [], inputs: [], outputs: [], scope: [], validate: [], command: 'echo' },
      { id: 'write-tests', type: 'llm', description: 'tests', agent: 'foreman-test-writer', deps: ['snapshot'], inputs: [], outputs: [], scope: [], validate: [] },
      { id: 'impl-core', type: 'llm', description: 'impl', agent: 'foreman-implementer', deps: ['write-tests'], inputs: [], outputs: [], scope: [], validate: [] },
    ]);
    const state = makeState('ch', { snapshot: 'complete', 'write-tests': 'complete', 'impl-core': 'pending' });
    setupChange(
      'ch', graph, state,
      { snapshot: 'snap done', 'write-tests': 'tests done' },
      { snapshot: 'L1 for snapshot', 'write-tests': 'L1 for write-tests' }
    );

    const bundle = assembleContext(root, 'ch', 'impl-core');
    // impl-core's parent is write-tests only (not snapshot)
    expect(bundle.l1).toHaveLength(1);
    expect(bundle.l1[0].nodeId).toBe('write-tests');
    expect(bundle.l1[0].content).toContain('L1 for write-tests');
  });

  it('includes snapshot content', () => {
    const graph = makeGraph('ch', [
      { id: 'snapshot', type: 'deterministic', description: 'snap', deps: [], inputs: [], outputs: [], scope: [], validate: [], command: 'echo' },
    ]);
    const state = makeState('ch', { snapshot: 'pending' });
    setupChange('ch', graph, state, {}, {}, '# Environment Snapshot\nfiles: 10');

    const bundle = assembleContext(root, 'ch', 'snapshot');
    expect(bundle.snapshot).toContain('files: 10');
  });

  it('returns empty snapshot when file does not exist', () => {
    const graph = makeGraph('ch', [
      { id: 'snapshot', type: 'deterministic', description: 'snap', deps: [], inputs: [], outputs: [], scope: [], validate: [], command: 'echo' },
    ]);
    const state = makeState('ch', { snapshot: 'pending' });
    setupChange('ch', graph, state);

    const bundle = assembleContext(root, 'ch', 'snapshot');
    expect(bundle.snapshot).toBe('');
  });

  it('includes node prompt from graph', () => {
    const graph = makeGraph('ch', [
      { id: 'write-tests', type: 'llm', description: 'tests', agent: 'foreman-test-writer', deps: [], inputs: [], outputs: [], scope: [], validate: [], prompt: 'Write failing tests for the new feature.' },
    ]);
    const state = makeState('ch', { 'write-tests': 'pending' });
    setupChange('ch', graph, state);

    const bundle = assembleContext(root, 'ch', 'write-tests');
    expect(bundle.prompt).toBe('Write failing tests for the new feature.');
  });
});

// ── renderContext ─────────────────────────────────────────────────────────────

describe('renderContext', () => {
  const baseBundle = (): ContextBundle => ({
    snapshot: '',
    l0: [],
    l1: [],
    inputs: {},
    prompt: '',
  });

  it('renders snapshot section when present', () => {
    const bundle = { ...baseBundle(), snapshot: '# Snapshot\nfiles: 5' };
    const rendered = renderContext(bundle);
    expect(rendered).toContain('## Environment Snapshot');
    expect(rendered).toContain('files: 5');
  });

  it('omits snapshot section when empty', () => {
    const bundle = baseBundle();
    const rendered = renderContext(bundle);
    expect(rendered).not.toContain('## Environment Snapshot');
  });

  it('renders L0 section with headlines', () => {
    const bundle = {
      ...baseBundle(),
      l0: [
        { nodeId: 'snapshot', headline: 'snapshot: complete, 42 files' },
        { nodeId: 'write-tests', headline: 'write-tests: complete, 5 tests' },
      ],
    };
    const rendered = renderContext(bundle);
    expect(rendered).toContain('## Completed Nodes (L0)');
    expect(rendered).toContain('**snapshot**');
    expect(rendered).toContain('**write-tests**');
  });

  it('renders L1 section with node summaries', () => {
    const bundle = {
      ...baseBundle(),
      l1: [{ nodeId: 'snapshot', content: 'Files changed: src/foo.ts\nExports: FooClass' }],
    };
    const rendered = renderContext(bundle);
    expect(rendered).toContain('## Parent Node Context (L1)');
    expect(rendered).toContain('### snapshot');
    expect(rendered).toContain('FooClass');
  });

  it('renders inputs section with file contents', () => {
    const bundle = {
      ...baseBundle(),
      inputs: { 'src/foo.ts': 'export function foo() {}' },
    };
    const rendered = renderContext(bundle);
    expect(rendered).toContain('## Input Files');
    expect(rendered).toContain('src/foo.ts');
    expect(rendered).toContain('export function foo()');
  });

  it('renders prompt section when present', () => {
    const bundle = { ...baseBundle(), prompt: 'Write tests for the auth module.' };
    const rendered = renderContext(bundle);
    expect(rendered).toContain('## Node Prompt');
    expect(rendered).toContain('Write tests for the auth module.');
  });

  it('returns empty string when everything is empty', () => {
    const rendered = renderContext(baseBundle());
    expect(rendered).toBe('');
  });

  it('joins sections with separator', () => {
    const bundle = {
      snapshot: '# snap',
      l0: [{ nodeId: 'n', headline: 'done' }],
      l1: [],
      inputs: {},
      prompt: '',
    };
    const rendered = renderContext(bundle);
    expect(rendered).toContain('---');
  });
});
