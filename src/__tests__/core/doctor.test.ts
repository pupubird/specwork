/**
 * Tests for the foreman doctor diagnostic system.
 *
 * RED state: src/core/doctor.ts does not exist yet — all tests must fail on import.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stringify as stringifyYaml } from 'yaml';

import {
  checkConfig,
  checkSpecs,
  checkArchives,
  checkChanges,
  checkGraphs,
  checkTemplates,
  checkCrossRefs,
  runDoctor,
  applyFixes,
} from '../../core/doctor.js';

import type {
  DiagnosticResult,
  CheckResult,
  DoctorReport,
} from '../../core/doctor.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'foreman-doctor-'));
}

/** Scaffold a minimal valid .foreman/ directory structure. */
function initForeman(root: string): void {
  const dirs = [
    '.foreman/env',
    '.foreman/graph',
    '.foreman/nodes',
    '.foreman/specs',
    '.foreman/changes/archive',
    '.foreman/templates',
  ];
  for (const d of dirs) {
    fs.mkdirSync(path.join(root, d), { recursive: true });
  }

  // Valid config with all required sections
  const config = {
    models: { default: 'sonnet', test_writer: 'opus', summarizer: 'haiku', verifier: 'haiku' },
    execution: { max_retries: 2, expand_limit: 1, parallel_mode: 'parallel', snapshot_refresh: 'after_each_node' },
    spec: { schema: 'spec-driven', specs_dir: '.foreman/specs', changes_dir: '.foreman/changes' },
    graph: { graphs_dir: '.foreman/graph', nodes_dir: '.foreman/nodes' },
  };
  fs.writeFileSync(path.join(root, '.foreman', 'config.yaml'), stringifyYaml(config), 'utf-8');

  // Templates
  fs.writeFileSync(path.join(root, '.foreman', 'templates', 'proposal.md'), '# Proposal\n', 'utf-8');
  fs.writeFileSync(path.join(root, '.foreman', 'templates', 'design.md'), '# Design\n', 'utf-8');
  fs.writeFileSync(path.join(root, '.foreman', 'templates', 'tasks.md'), '## 1. Default\n\n- [ ] 1.1 Placeholder\n', 'utf-8');
}

/** Write a spec file with given content. */
function writeSpec(root: string, name: string, content: string): void {
  const specPath = path.join(root, '.foreman', 'specs', name);
  fs.mkdirSync(path.dirname(specPath), { recursive: true });
  fs.writeFileSync(specPath, content, 'utf-8');
}

/** Create a change directory with required files. */
function createChange(root: string, name: string, opts: { status?: string; files?: Record<string, string> } = {}): void {
  const changeDir = path.join(root, '.foreman', 'changes', name);
  fs.mkdirSync(changeDir, { recursive: true });

  const meta = { schema: 'foreman-change/v1', change: name, status: opts.status ?? 'active', created_at: '2026-03-27T00:00:00Z' };
  fs.writeFileSync(path.join(changeDir, '.foreman.yaml'), stringifyYaml(meta), 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'proposal.md'), opts.files?.['proposal.md'] ?? '# Proposal\n\nTest proposal', 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'design.md'), opts.files?.['design.md'] ?? '# Design\n\nTest design', 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'tasks.md'), opts.files?.['tasks.md'] ?? '## 1. Core\n\n- [ ] 1.1 Do something\n', 'utf-8');
}

/** Create an archive entry. */
function createArchive(root: string, name: string, opts: { missingFiles?: string[]; extraFiles?: string[]; status?: string } = {}): void {
  const archiveDir = path.join(root, '.foreman', 'changes', 'archive', name);
  fs.mkdirSync(archiveDir, { recursive: true });

  const requiredFiles: Record<string, string> = {
    '.foreman.yaml': stringifyYaml({ schema: 'foreman-change/v1', change: name, status: opts.status ?? 'archived', archived_at: '2026-03-27T00:00:00Z' }),
    'proposal.md': '# Proposal\n',
    'design.md': '# Design\n',
    'tasks.md': '## 1. Core\n\n- [ ] 1.1 Done\n',
    'summary.md': '# Summary\n\nCompleted.',
  };

  for (const [file, content] of Object.entries(requiredFiles)) {
    if (!(opts.missingFiles ?? []).includes(file)) {
      fs.writeFileSync(path.join(archiveDir, file), content, 'utf-8');
    }
  }

  for (const extraFile of opts.extraFiles ?? []) {
    fs.writeFileSync(path.join(archiveDir, extraFile), 'stale artifact', 'utf-8');
  }
}

/** Create a graph with nodes. */
function createGraph(root: string, change: string, nodeIds: string[], opts: { cycle?: boolean } = {}): void {
  const graphDir = path.join(root, '.foreman', 'graph', change);
  fs.mkdirSync(graphDir, { recursive: true });

  const nodes = nodeIds.map((id, i) => ({
    id,
    type: i === 0 ? 'deterministic' : 'llm',
    description: `Node ${id}`,
    deps: opts.cycle && i === nodeIds.length - 1 ? [nodeIds[0]] : i > 0 ? [nodeIds[i - 1]] : [],
    inputs: [],
    outputs: [],
    scope: i === 0 ? [] : ['src/'],
    validate: [{ type: 'tsc-check' }],
    ...(i === 0 ? { command: 'foreman snapshot' } : { agent: 'foreman-implementer' }),
  }));

  // Add cycle: first node depends on last
  if (opts.cycle && nodeIds.length > 1) {
    nodes[0].deps = [nodeIds[nodeIds.length - 1]];
  }

  const graph = {
    change,
    version: '1',
    created_at: '2026-03-27T00:00:00Z',
    nodes,
  };

  fs.writeFileSync(path.join(graphDir, 'graph.yaml'), stringifyYaml(graph), 'utf-8');

  const stateNodes: Record<string, unknown> = {};
  for (const id of nodeIds) {
    stateNodes[id] = { status: 'pending' };
  }
  const state = { status: 'pending', nodes: stateNodes, updated_at: '2026-03-27T00:00:00Z' };
  fs.writeFileSync(path.join(graphDir, 'state.yaml'), stringifyYaml(state), 'utf-8');
}

/** Create node directories for a change. */
function createNodeDirs(root: string, change: string, nodeIds: string[]): void {
  for (const id of nodeIds) {
    const nd = path.join(root, '.foreman', 'nodes', change, id);
    fs.mkdirSync(nd, { recursive: true });
    fs.writeFileSync(path.join(nd, 'L0.md'), `- ${id}: done\n`, 'utf-8');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// checkConfig
// ══════════════════════════════════════════════════════════════════════════════

describe('checkConfig', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpRoot();
    initForeman(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('passes when config has all required sections', () => {
    const result = checkConfig(root);
    expect(result.category).toBe('Config');
    expect(result.results.length).toBeGreaterThan(0);
    for (const r of result.results) {
      expect(r.pass).toBe(true);
    }
  });

  it('fails when config.yaml is missing', () => {
    fs.unlinkSync(path.join(root, '.foreman', 'config.yaml'));
    const result = checkConfig(root);
    expect(result.category).toBe('Config');
    const failing = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(failing.length).toBeGreaterThan(0);
  });

  it('fails when a required section is missing and names it', () => {
    // Write config without the 'execution' section
    const config = {
      models: { default: 'sonnet' },
      spec: { schema: 'spec-driven' },
      graph: { graphs_dir: '.foreman/graph' },
    };
    fs.writeFileSync(path.join(root, '.foreman', 'config.yaml'), stringifyYaml(config), 'utf-8');

    const result = checkConfig(root);
    const failing = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(failing.length).toBeGreaterThan(0);
    // Should mention the missing section name
    const details = failing.map((r: DiagnosticResult) => r.detail ?? r.label).join(' ');
    expect(details).toMatch(/execution/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// checkSpecs
// ══════════════════════════════════════════════════════════════════════════════

describe('checkSpecs', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpRoot();
    initForeman(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('passes for a valid spec with ### Requirement and #### Scenario', () => {
    writeSpec(root, 'auth.md', [
      '### Requirement: User Authentication',
      '',
      '#### Scenario: Valid Login',
      '',
      'GIVEN a registered user',
      'WHEN they submit valid credentials',
      'THEN they SHALL receive a token',
    ].join('\n'));

    const result = checkSpecs(root);
    expect(result.category).toBe('Specs');
    const failing = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(failing).toHaveLength(0);
  });

  it('errors on spec using ### Scenario (wrong heading level) and marks fixable', () => {
    writeSpec(root, 'bad-heading.md', [
      '### Requirement: Something',
      '',
      '### Scenario: Wrong Level',
      '',
      'GIVEN something',
      'WHEN something happens',
      'THEN something SHALL result',
    ].join('\n'));

    const result = checkSpecs(root);
    const wrongHeading = result.results.filter(
      (r: DiagnosticResult) => !r.pass && r.fixable
    );
    expect(wrongHeading.length).toBeGreaterThan(0);
  });

  it('warns on spec missing GIVEN/WHEN/THEN in a scenario', () => {
    writeSpec(root, 'missing-gwt.md', [
      '### Requirement: Logging',
      '',
      '#### Scenario: Log Message',
      '',
      'The system logs all messages.',
    ].join('\n'));

    const result = checkSpecs(root);
    const issues = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('passes spec with SHALL/SHOULD/MAY keywords', () => {
    writeSpec(root, 'keywords.md', [
      '### Requirement: Validation',
      '',
      '#### Scenario: Input Check',
      '',
      'GIVEN input data',
      'WHEN validated',
      'THEN the system SHALL reject invalid input',
      'THEN the system SHOULD log warnings',
      'THEN the system MAY notify the admin',
    ].join('\n'));

    const result = checkSpecs(root);
    // Keyword-related checks should pass
    const keywordResults = result.results.filter(
      (r: DiagnosticResult) => r.label.toLowerCase().includes('keyword') || r.label.toLowerCase().includes('shall')
    );
    for (const r of keywordResults) {
      expect(r.pass).toBe(true);
    }
  });

  it('passes when no specs exist (nothing to check)', () => {
    const result = checkSpecs(root);
    expect(result.category).toBe('Specs');
    // No specs = no failures (vacuously valid)
    const failing = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(failing).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// checkArchives
// ══════════════════════════════════════════════════════════════════════════════

describe('checkArchives', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpRoot();
    initForeman(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('passes for valid archive with all required files and correct status', () => {
    createArchive(root, 'completed-change');

    const result = checkArchives(root);
    expect(result.category).toBe('Archives');
    const failing = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(failing).toHaveLength(0);
  });

  it('errors when archive is missing summary.md', () => {
    createArchive(root, 'no-summary', { missingFiles: ['summary.md'] });

    const result = checkArchives(root);
    const failing = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(failing.length).toBeGreaterThan(0);
    const details = failing.map((r: DiagnosticResult) => r.detail ?? r.label).join(' ');
    expect(details).toMatch(/summary/i);
  });

  it('warns on archive with loose graph.yaml and marks fixable', () => {
    createArchive(root, 'has-loose-files', { extraFiles: ['graph.yaml'] });

    const result = checkArchives(root);
    const fixableWarnings = result.results.filter(
      (r: DiagnosticResult) => !r.pass && r.fixable
    );
    expect(fixableWarnings.length).toBeGreaterThan(0);
  });

  it('warns on archive with loose state.yaml and marks fixable', () => {
    createArchive(root, 'has-state', { extraFiles: ['state.yaml'] });

    const result = checkArchives(root);
    const fixableWarnings = result.results.filter(
      (r: DiagnosticResult) => !r.pass && r.fixable
    );
    expect(fixableWarnings.length).toBeGreaterThan(0);
  });

  it('errors when archive .foreman.yaml has wrong status', () => {
    createArchive(root, 'wrong-status', { status: 'active' });

    const result = checkArchives(root);
    const failing = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(failing.length).toBeGreaterThan(0);
  });

  it('errors when archive is missing .foreman.yaml', () => {
    createArchive(root, 'no-meta', { missingFiles: ['.foreman.yaml'] });

    const result = checkArchives(root);
    const failing = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(failing.length).toBeGreaterThan(0);
  });

  it('passes when no archives exist', () => {
    const result = checkArchives(root);
    expect(result.category).toBe('Archives');
    const failing = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(failing).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// checkChanges
// ══════════════════════════════════════════════════════════════════════════════

describe('checkChanges', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpRoot();
    initForeman(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('passes for a valid change with all required files', () => {
    createChange(root, 'my-feature');

    const result = checkChanges(root);
    expect(result.category).toBe('Changes');
    const failing = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(failing).toHaveLength(0);
  });

  it('errors when change is missing proposal.md', () => {
    createChange(root, 'no-proposal');
    fs.unlinkSync(path.join(root, '.foreman', 'changes', 'no-proposal', 'proposal.md'));

    const result = checkChanges(root);
    const failing = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(failing.length).toBeGreaterThan(0);
    const details = failing.map((r: DiagnosticResult) => r.detail ?? r.label).join(' ');
    expect(details).toMatch(/proposal/i);
  });

  it('errors when tasks.md does not use checkbox format', () => {
    createChange(root, 'bad-tasks', {
      files: {
        'tasks.md': '## 1. Core\n\n1. Do something\n2. Do another thing\n',
      },
    });

    const result = checkChanges(root);
    const failing = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(failing.length).toBeGreaterThan(0);
    const details = failing.map((r: DiagnosticResult) => r.detail ?? r.label).join(' ');
    expect(details).toMatch(/checkbox|task/i);
  });

  it('passes when no changes exist', () => {
    const result = checkChanges(root);
    expect(result.category).toBe('Changes');
    const failing = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(failing).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// checkGraphs
// ══════════════════════════════════════════════════════════════════════════════

describe('checkGraphs', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpRoot();
    initForeman(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('passes for a valid graph', () => {
    createGraph(root, 'my-change', ['snapshot', 'write-tests', 'impl-core']);

    const result = checkGraphs(root);
    expect(result.category).toBe('Graphs');
    const failing = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(failing).toHaveLength(0);
  });

  it('errors when graph has a cycle', () => {
    createGraph(root, 'cyclic-change', ['a', 'b', 'c'], { cycle: true });

    const result = checkGraphs(root);
    const failing = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(failing.length).toBeGreaterThan(0);
  });

  it('passes when no active graphs exist', () => {
    const result = checkGraphs(root);
    expect(result.category).toBe('Graphs');
    const failing = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(failing).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// checkTemplates
// ══════════════════════════════════════════════════════════════════════════════

describe('checkTemplates', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpRoot();
    initForeman(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('passes when all templates are present', () => {
    initForeman(root);

    const result = checkTemplates(root);
    expect(result.category).toBe('Templates');
    const failing = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(failing).toHaveLength(0);
  });

  it('errors when a template is missing and marks fixable', () => {
    initForeman(root);
    fs.unlinkSync(path.join(root, '.foreman', 'templates', 'proposal.md'));

    const result = checkTemplates(root);
    const failing = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(failing.length).toBeGreaterThan(0);
    expect(failing[0].fixable).toBe(true);
  });

  it('errors when templates directory is missing', () => {
    // Remove templates dir created by initForeman to simulate missing templates
    fs.rmSync(path.join(root, '.foreman', 'templates'), { recursive: true, force: true });

    const result = checkTemplates(root);
    const failing = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(failing.length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// checkCrossRefs
// ══════════════════════════════════════════════════════════════════════════════

describe('checkCrossRefs', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpRoot();
    initForeman(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('passes when graph node IDs match node directories', () => {
    const nodeIds = ['snapshot', 'write-tests', 'impl-core'];
    createGraph(root, 'my-change', nodeIds);
    createNodeDirs(root, 'my-change', nodeIds);

    const result = checkCrossRefs(root);
    expect(result.category).toBe('CrossRefs');
    const failing = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(failing).toHaveLength(0);
  });

  it('warns on orphaned node directory not in graph', () => {
    const graphNodeIds = ['snapshot', 'write-tests'];
    createGraph(root, 'my-change', graphNodeIds);
    createNodeDirs(root, 'my-change', [...graphNodeIds, 'orphaned-node']);

    const result = checkCrossRefs(root);
    const warnings = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(warnings.length).toBeGreaterThan(0);
    const details = warnings.map((r: DiagnosticResult) => r.detail ?? r.label).join(' ');
    expect(details).toMatch(/orphan/i);
  });

  it('errors when graph references a change that does not exist', () => {
    // Create a graph for a change that has no change directory
    createGraph(root, 'ghost-change', ['snapshot']);

    const result = checkCrossRefs(root);
    const failing = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(failing.length).toBeGreaterThan(0);
  });

  it('passes when no graphs and no nodes exist', () => {
    const result = checkCrossRefs(root);
    expect(result.category).toBe('CrossRefs');
    const failing = result.results.filter((r: DiagnosticResult) => !r.pass);
    expect(failing).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// runDoctor
// ══════════════════════════════════════════════════════════════════════════════

describe('runDoctor', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpRoot();
    initForeman(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('runs all checkers and aggregates results', () => {
    const report = runDoctor({ root });
    expect(report.checks.length).toBeGreaterThan(0);
    expect(report).toHaveProperty('totalPass');
    expect(report).toHaveProperty('totalFail');
    expect(report).toHaveProperty('totalFixable');
  });

  it('respects category filter', () => {
    const report = runDoctor({ root, category: 'Config' });
    expect(report.checks).toHaveLength(1);
    expect(report.checks[0].category).toBe('Config');
  });

  it('counts pass/fail/fixable correctly on a healthy project', () => {
    const report = runDoctor({ root });
    expect(report.totalPass).toBeGreaterThan(0);
    expect(report.totalFail).toBe(0);
    expect(report.totalFixable).toBe(0);
  });

  it('counts failures correctly on a broken project', () => {
    // Remove config to cause a failure
    fs.unlinkSync(path.join(root, '.foreman', 'config.yaml'));

    const report = runDoctor({ root });
    expect(report.totalFail).toBeGreaterThan(0);
  });

  it('counts fixable issues separately from non-fixable', () => {
    // Remove a template (fixable)
    fs.unlinkSync(path.join(root, '.foreman', 'templates', 'proposal.md'));

    const report = runDoctor({ root });
    expect(report.totalFixable).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// applyFixes
// ══════════════════════════════════════════════════════════════════════════════

describe('applyFixes', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpRoot();
    initForeman(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('calls fix() on fixable failures and returns count', async () => {
    let fixCalled = 0;
    const report: DoctorReport = {
      checks: [
        {
          category: 'Templates',
          results: [
            { category: 'Templates', label: 'proposal.md exists', pass: false, fixable: true, fix: async () => { fixCalled++; } },
            { category: 'Templates', label: 'design.md exists', pass: false, fixable: true, fix: async () => { fixCalled++; } },
          ],
        },
      ],
      totalPass: 0,
      totalFail: 2,
      totalFixable: 2,
    };

    const count = await applyFixes(report);
    expect(count).toBe(2);
    expect(fixCalled).toBe(2);
  });

  it('skips non-fixable failures', async () => {
    const report: DoctorReport = {
      checks: [
        {
          category: 'Config',
          results: [
            { category: 'Config', label: 'config.yaml exists', pass: false, fixable: false },
          ],
        },
      ],
      totalPass: 0,
      totalFail: 1,
      totalFixable: 0,
    };

    const count = await applyFixes(report);
    expect(count).toBe(0);
  });

  it('skips passing results even if they have a fix function', async () => {
    let fixCalled = false;
    const report: DoctorReport = {
      checks: [
        {
          category: 'Config',
          results: [
            { category: 'Config', label: 'config OK', pass: true, fixable: true, fix: async () => { fixCalled = true; } },
          ],
        },
      ],
      totalPass: 1,
      totalFail: 0,
      totalFixable: 0,
    };

    const count = await applyFixes(report);
    expect(count).toBe(0);
    expect(fixCalled).toBe(false);
  });
});
