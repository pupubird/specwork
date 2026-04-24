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
  sliceSpecs,
  getStructuredL1,
  composeMicroSpec,
} from '../../core/context-assembler.js';
import type { Graph } from '../../types/graph.js';
import type { WorkflowState } from '../../types/state.js';
import type { ContextBundle } from '../../types/context.js';
import type { StructuredL1 } from '../../types/context.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeTmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-test-'));
}

function makeNodeDir(root: string, change: string, nodeId: string): string {
  const dir = path.join(root, '.specwork', 'nodes', change, nodeId);
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
    l1Map: Record<string, string> = {}
  ): void {
    const graphDir = path.join(root, '.specwork', 'graph', change);
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
  }

  it('returns empty l0 when no nodes complete', () => {
    const graph = makeGraph('ch', [
      { id: 'write-tests', type: 'llm', description: 'tests', agent: 'specwork-test-writer', deps: [], inputs: [], outputs: [], scope: [], validate: [] },
    ]);
    const state = makeState('ch', { 'write-tests': 'pending' });
    setupChange('ch', graph, state);

    const bundle = assembleContext(root, 'ch', 'write-tests');
    expect(bundle.l0).toHaveLength(0);
  });

  it('includes L0 only for completed nodes', () => {
    const graph = makeGraph('ch', [
      { id: 'write-tests', type: 'llm', description: 'tests', agent: 'specwork-test-writer', deps: [], inputs: [], outputs: [], scope: [], validate: [] },
      { id: 'impl-core', type: 'llm', description: 'impl', agent: 'specwork-implementer', deps: ['write-tests'], inputs: [], outputs: [], scope: [], validate: [] },
    ]);
    const state = makeState('ch', { 'write-tests': 'complete', 'impl-core': 'pending' });
    setupChange('ch', graph, state, { 'write-tests': 'write-tests: complete, 5 tests written' });

    const bundle = assembleContext(root, 'ch', 'impl-core');
    expect(bundle.l0).toHaveLength(1);
    expect(bundle.l0[0].nodeId).toBe('write-tests');
  });

  it('includes L1 only for direct parents', () => {
    const graph = makeGraph('ch', [
      { id: 'write-tests', type: 'llm', description: 'tests', agent: 'specwork-test-writer', deps: [], inputs: [], outputs: [], scope: [], validate: [] },
      { id: 'impl-core', type: 'llm', description: 'impl', agent: 'specwork-implementer', deps: ['write-tests'], inputs: [], outputs: [], scope: [], validate: [] },
      { id: 'integration', type: 'llm', description: 'integration', agent: 'specwork-qa', deps: ['impl-core'], inputs: [], outputs: [], scope: [], validate: [] },
    ]);
    const state = makeState('ch', { 'write-tests': 'complete', 'impl-core': 'complete', 'integration': 'pending' });
    setupChange(
      'ch', graph, state,
      { 'write-tests': 'tests done', 'impl-core': 'impl done' },
      { 'write-tests': 'L1 for write-tests', 'impl-core': 'L1 for impl-core' }
    );

    const bundle = assembleContext(root, 'ch', 'integration');
    // integration's parent is impl-core only (not write-tests)
    expect(bundle.l1).toHaveLength(1);
    expect(bundle.l1[0].nodeId).toBe('impl-core');
    expect(bundle.l1[0].content).toContain('L1 for impl-core');
  });

  it('includes node prompt from graph', () => {
    const graph = makeGraph('ch', [
      { id: 'write-tests', type: 'llm', description: 'tests', agent: 'specwork-test-writer', deps: [], inputs: [], outputs: [], scope: [], validate: [], prompt: 'Write failing tests for the new feature.' },
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
    l0: [],
    l1: [],
    inputs: {},
    prompt: '',
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
      l0: [{ nodeId: 'n', headline: 'done' }],
      l1: [{ nodeId: 'm', content: 'L1 content' }],
      inputs: {},
      prompt: '',
    };
    const rendered = renderContext(bundle);
    expect(rendered).toContain('---');
  });
});

// ── sliceSpecs ───────────────────────────────────────────────────────────────

describe('sliceSpecs', () => {
  let root: string;

  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('resolves file.md#ScenarioName references', () => {
    const specsDir = path.join(root, '.specwork', 'changes', 'ch', 'specs');
    fs.mkdirSync(specsDir, { recursive: true });
    const specContent = [
      '### Requirement: Auth',
      '',
      '#### Scenario: Login',
      'User logs in with valid credentials.',
      '',
      '#### Scenario: Logout',
      'User logs out and session is cleared.',
    ].join('\n');
    writeFile(path.join(specsDir, 'auth.md'), specContent);

    const result = sliceSpecs(root, 'ch', ['auth.md#Login']);
    expect(result).toContain('Scenario: Login');
    expect(result).toContain('valid credentials');
    expect(result).not.toContain('Scenario: Logout');
  });

  it('returns full file when no anchor', () => {
    const specsDir = path.join(root, '.specwork', 'changes', 'ch', 'specs');
    fs.mkdirSync(specsDir, { recursive: true });
    const specContent = '### Requirement: Auth\nFull content here.';
    writeFile(path.join(specsDir, 'auth.md'), specContent);

    const result = sliceSpecs(root, 'ch', ['auth.md']);
    expect(result).toContain('Full content here.');
  });

  it('concatenates multiple refs', () => {
    const specsDir = path.join(root, '.specwork', 'changes', 'ch', 'specs');
    fs.mkdirSync(specsDir, { recursive: true });
    writeFile(path.join(specsDir, 'auth.md'), '### Requirement: Auth\nAuth content.');
    writeFile(path.join(specsDir, 'api.md'), '### Requirement: API\nAPI content.');

    const result = sliceSpecs(root, 'ch', ['auth.md', 'api.md']);
    expect(result).toContain('Auth content.');
    expect(result).toContain('API content.');
  });

  it('includes warning comment for missing file', () => {
    const result = sliceSpecs(root, 'ch', ['nonexistent.md']);
    expect(result).toContain('nonexistent.md');
    // Should contain some kind of warning/comment about missing file
    expect(result).toMatch(/warning|missing|not found/i);
  });

  it('includes warning comment for missing anchor', () => {
    const specsDir = path.join(root, '.specwork', 'changes', 'ch', 'specs');
    fs.mkdirSync(specsDir, { recursive: true });
    writeFile(path.join(specsDir, 'auth.md'), '### Requirement: Auth\nContent.');

    const result = sliceSpecs(root, 'ch', ['auth.md#NonexistentScenario']);
    expect(result).toMatch(/warning|missing|not found/i);
    expect(result).toContain('NonexistentScenario');
  });
});

// ── getStructuredL1 ──────────────────────────────────────────────────────────

describe('getStructuredL1', () => {
  let root: string;

  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('reads L1-structured.json and returns typed object', () => {
    const dir = makeNodeDir(root, 'ch', 'write-tests');
    const structured: StructuredL1 = {
      decisions: ['Use vitest for testing'],
      contracts: ['getSiblings(graph, nodeId): string[]'],
      enables: ['impl-core'],
      changed: ['src/__tests__/core/graph-walker.test.ts'],
    };
    writeFile(path.join(dir, 'L1-structured.json'), JSON.stringify(structured));

    const result = getStructuredL1(root, 'ch', 'write-tests');
    expect(result).not.toBeNull();
    expect(result!.decisions).toContain('Use vitest for testing');
    expect(result!.contracts).toContain('getSiblings(graph, nodeId): string[]');
    expect(result!.enables).toContain('impl-core');
    expect(result!.changed).toContain('src/__tests__/core/graph-walker.test.ts');
  });

  it('returns null when file is absent', () => {
    makeNodeDir(root, 'ch', 'write-tests');
    const result = getStructuredL1(root, 'ch', 'write-tests');
    expect(result).toBeNull();
  });
});


// ── composeMicroSpec ─────────────────────────────────────────────────────────

describe('composeMicroSpec', () => {
  let root: string;

  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  function setupGraphAndState(change: string, nodes: Graph['nodes']): void {
    const graphDir = path.join(root, '.specwork', 'graph', change);
    fs.mkdirSync(graphDir, { recursive: true });
    const graph: Graph = { change, version: '1', created_at: '2026-03-26T00:00:00Z', nodes };
    fs.writeFileSync(path.join(graphDir, 'graph.yaml'), stringifyYaml(graph), 'utf8');

    const stateNodes: WorkflowState['nodes'] = {};
    for (const node of nodes) {
      stateNodes[node.id] = { status: 'pending', started_at: null, completed_at: null, retries: 0, error: null, l0: null };
    }
    const state: WorkflowState = {
      change,
      status: 'active',
      started_at: '2026-03-26T00:00:00Z',
      updated_at: '2026-03-26T00:00:00Z',
      lock: null,
      nodes: stateNodes,
    };
    fs.writeFileSync(path.join(graphDir, 'state.yaml'), stringifyYaml(state), 'utf8');
  }

  it('composes a full micro-spec from all sections', () => {
    const nodes: Graph['nodes'] = [
      {
        id: 'write-tests',
        type: 'llm',
        description: 'write tests',
        agent: 'specwork-test-writer',
        deps: [],
        inputs: [],
        outputs: [],
        scope: ['src/__tests__/'],
        validate: [],
      },
      {
        id: 'impl-core',
        type: 'llm',
        description: 'implement core',
        agent: 'specwork-implementer',
        deps: ['write-tests'],
        inputs: [],
        outputs: ['src/core/foo.ts'],
        scope: ['src/core/**'],
        validate: [{ type: 'tests-pass' }, { type: 'tsc-check' }],
        prompt: 'Implement the core module.',
        specs: ['auth.md#Login'],
      },
    ];
    setupGraphAndState('ch', nodes);

    // Set up L0 for write-tests
    const writeTestsNodeDir = makeNodeDir(root, 'ch', 'write-tests');
    writeFile(path.join(writeTestsNodeDir, 'L0.md'), 'write-tests: complete, 5 tests written');

    // Set up specs
    const specsDir = path.join(root, '.specwork', 'changes', 'ch', 'specs');
    fs.mkdirSync(specsDir, { recursive: true });
    writeFile(path.join(specsDir, 'auth.md'), '#### Scenario: Login\nUser logs in.');

    // Set up structured L1 for parent (write-tests)
    const structured: StructuredL1 = {
      decisions: ['Use vitest for tests'],
      contracts: [],
      enables: ['impl-core'],
      changed: [],
    };
    writeFile(path.join(writeTestsNodeDir, 'L1-structured.json'), JSON.stringify(structured));

    const result = composeMicroSpec(root, 'ch', 'impl-core');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // Should contain key sections
    expect(result).toContain('impl-core');
  });

  it('omits empty sections', () => {
    const nodes: Graph['nodes'] = [
      {
        id: 'impl-simple',
        type: 'llm',
        description: 'simple impl',
        agent: 'specwork-implementer',
        deps: [],
        inputs: [],
        outputs: [],
        scope: [],
        validate: [],
      },
    ];
    setupGraphAndState('ch', nodes);

    const result = composeMicroSpec(root, 'ch', 'impl-simple');
    expect(typeof result).toBe('string');
    // With no specs, scope, L1, etc., those sections should be absent
    // The result should not contain spec-related headers for empty data
  });

  it('is backward compatible when no specs/scope/structured-L1 exist', () => {
    // Old-style node without the new fields
    const nodes: Graph['nodes'] = [
      {
        id: 'write-tests',
        type: 'llm',
        description: 'write tests',
        agent: 'specwork-test-writer',
        deps: [],
        inputs: [],
        outputs: [],
        scope: [],
        validate: [],
        prompt: 'Write tests.',
      },
      {
        id: 'impl-core',
        type: 'llm',
        description: 'impl core',
        agent: 'specwork-implementer',
        deps: ['write-tests'],
        inputs: [],
        outputs: [],
        scope: [],
        validate: [],
      },
    ];
    setupGraphAndState('ch', nodes);

    // Set up basic L0/L1 for write-tests
    const writeTestsDir = makeNodeDir(root, 'ch', 'write-tests');
    writeFile(path.join(writeTestsDir, 'L0.md'), 'write-tests: done');
    writeFile(path.join(writeTestsDir, 'L1.md'), 'Write-tests summary content');

    // Should not throw — backward compatible
    const result = composeMicroSpec(root, 'ch', 'impl-core');
    expect(typeof result).toBe('string');
  });
});
