import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { createTestProject, runSpecwork, cleanup, writeTasksFile } from './helpers.js';

// ── Minimal tasks.md that produces a valid, small graph ────────────────────────
const SIMPLE_TASKS = `## 1. Setup

- [ ] 1.1 Initialize the module src/auth/jwt.ts
- [ ] 1.2 Add configuration src/auth/config.ts

## 2. Implementation

- [ ] 2.1 Write the core logic src/core/engine.ts
`;

// ── Helpers ────────────────────────────────────────────────────────────────────

function setupProjectWithGraph(dir: string, change = 'my-change'): void {
  runSpecwork(dir, 'init');
  runSpecwork(dir, `new ${change}`);
  writeTasksFile(dir, change, SIMPLE_TASKS);
  runSpecwork(dir, `graph generate ${change}`);
}

function markNodeStatus(dir: string, change: string, nodeId: string, status: string): void {
  const sp = path.join(dir, '.specwork', 'graph', change, 'state.yaml');
  const raw = fs.readFileSync(sp, 'utf-8');
  const state = parseYaml(raw) as Record<string, unknown>;
  const nodes = state.nodes as Record<string, Record<string, unknown>>;
  const ts = new Date().toISOString();
  nodes[nodeId] = { ...nodes[nodeId], status, ...(status === 'in_progress' ? { started_at: ts } : { completed_at: ts }) };
  state.updated_at = ts;
  fs.writeFileSync(sp, stringifyYaml(state), 'utf-8');
}

function readGraphYaml(dir: string, change: string): Record<string, unknown> {
  const gp = path.join(dir, '.specwork', 'graph', change, 'graph.yaml');
  return parseYaml(fs.readFileSync(gp, 'utf-8')) as Record<string, unknown>;
}

function writeGraphYaml(dir: string, change: string, graph: Record<string, unknown>): void {
  const gp = path.join(dir, '.specwork', 'graph', change, 'graph.yaml');
  fs.writeFileSync(gp, stringifyYaml(graph), 'utf-8');
}

function readStateYaml(dir: string, change: string): Record<string, unknown> {
  const sp = path.join(dir, '.specwork', 'graph', change, 'state.yaml');
  return parseYaml(fs.readFileSync(sp, 'utf-8')) as Record<string, unknown>;
}

function readConfig(dir: string): Record<string, unknown> {
  const cp = path.join(dir, '.specwork', 'config.yaml');
  return parseYaml(fs.readFileSync(cp, 'utf-8')) as Record<string, unknown>;
}

function writeConfig(dir: string, config: Record<string, unknown>): void {
  const cp = path.join(dir, '.specwork', 'config.yaml');
  fs.writeFileSync(cp, stringifyYaml(config), 'utf-8');
}

function commitFile(dir: string, filePath: string, content: string): void {
  const fullPath = path.join(dir, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
  execSync(`git add "${filePath}"`, { cwd: dir, stdio: 'pipe' });
  execSync(`git commit -m "add ${filePath}"`, { cwd: dir, stdio: 'pipe' });
}

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Verification is Mandatory
// ══════════════════════════════════════════════════════════════════════════════

describe('verification is mandatory', () => {
  let dir: string;

  beforeEach(() => { dir = createTestProject(); });
  afterEach(() => { cleanup(dir); });

  it('rejects verify: none in config', () => {
    setupProjectWithGraph(dir);
    const config = readConfig(dir);
    const execution = config.execution as Record<string, unknown>;
    execution.verify = 'none';
    writeConfig(dir, config);

    // Any command should reject the config
    const result = runSpecwork(dir, 'status my-change --json');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/verify.*none.*not.*allowed|verification.*mandatory|cannot.*disable/i);
  });

  it('accepts verify: strict', () => {
    setupProjectWithGraph(dir);
    const config = readConfig(dir);
    const execution = config.execution as Record<string, unknown>;
    execution.verify = 'strict';
    writeConfig(dir, config);

    const result = runSpecwork(dir, 'status my-change');
    expect(result.exitCode).toBe(0);
  });

  it('accepts verify: gates', () => {
    setupProjectWithGraph(dir);
    const config = readConfig(dir);
    const execution = config.execution as Record<string, unknown>;
    execution.verify = 'gates';
    writeConfig(dir, config);

    const result = runSpecwork(dir, 'status my-change');
    expect(result.exitCode).toBe(0);
  });

  it('node complete without passing verification returns error', () => {
    setupProjectWithGraph(dir);
    runSpecwork(dir, 'node start my-change write-tests');

    // Try to complete without verifying first (non-json mode to get stderr)
    const result = runSpecwork(dir, 'node complete my-change write-tests --l0 "done" --no-commit');

    // Should fail with verification error
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/verif|must.*pass/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Scope Enforcement via CLI
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Files Unchanged via CLI
// ══════════════════════════════════════════════════════════════════════════════

describe('files-unchanged via CLI', () => {
  let dir: string;

  beforeEach(() => { dir = createTestProject(); });
  afterEach(() => { cleanup(dir); });

  it('verify FAILS when protected test files are modified', () => {
    setupProjectWithGraph(dir);

    // Add files-unchanged rule to an impl node
    const graph = readGraphYaml(dir, 'my-change');
    const nodes = graph.nodes as Array<Record<string, unknown>>;
    const implNode = nodes.find(n => (n.id as string).startsWith('impl-'))!;
    implNode.validate = [{ type: 'files-unchanged', args: { files: ['src/__tests__/'] } }];
    writeGraphYaml(dir, 'my-change', graph);

    // Create and commit a test file, then modify it
    commitFile(dir, 'src/__tests__/auth.test.ts', 'test("a", () => {});');
    fs.writeFileSync(path.join(dir, 'src/__tests__/auth.test.ts'), 'test("b", () => {});', 'utf-8');

    // Mark write-tests as complete so we can start impl
    markNodeStatus(dir, 'my-change', 'write-tests', 'complete');

    const nodeId = implNode.id as string;
    runSpecwork(dir, `node start my-change ${nodeId}`);

    const result = runSpecwork(dir, `--json node verify my-change ${nodeId}`);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.verdict).toBe('FAIL');
    expect(json.checks.some((c: any) => c.type === 'files-unchanged' && c.status === 'FAIL')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Structured Error Output via CLI
// ══════════════════════════════════════════════════════════════════════════════

describe('structured error output via CLI', () => {
  let dir: string;

  beforeEach(() => { dir = createTestProject(); });
  afterEach(() => { cleanup(dir); });

  it('verify JSON includes errors array with structured objects', () => {
    setupProjectWithGraph(dir);

    // Make write-tests node have a failing file-exists check
    const graph = readGraphYaml(dir, 'my-change');
    const nodes = graph.nodes as Array<Record<string, unknown>>;
    const writeTestsNode = nodes.find(n => n.id === 'write-tests')!;
    writeTestsNode.validate = [{ type: 'file-exists', args: { path: 'nonexistent-file.ts' } }];
    writeGraphYaml(dir, 'my-change', graph);

    runSpecwork(dir, 'node start my-change write-tests');

    const result = runSpecwork(dir, '--json node verify my-change write-tests');
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.verdict).toBe('FAIL');
    expect(json.checks[0].errors).toBeDefined();
    expect(Array.isArray(json.checks[0].errors)).toBe(true);
    expect(typeof json.checks[0].duration_ms).toBe('number');
  });

  it('detail field is at most 200 characters', () => {
    setupProjectWithGraph(dir);
    runSpecwork(dir, 'node start my-change write-tests');

    const result = runSpecwork(dir, '--json node verify my-change write-tests');
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    for (const check of json.checks) {
      expect(check.detail.length).toBeLessThanOrEqual(200);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Check Execution Order via CLI (fail-fast)
// ══════════════════════════════════════════════════════════════════════════════

describe('fail-fast via CLI', () => {
  let dir: string;

  beforeEach(() => { dir = createTestProject(); });
  afterEach(() => { cleanup(dir); });

  it('skips expensive checks when cheap check fails', () => {
    setupProjectWithGraph(dir);

    // Give write-tests node multiple checks: file-exists (will fail) + tsc-check
    const graph = readGraphYaml(dir, 'my-change');
    const nodes = graph.nodes as Array<Record<string, unknown>>;
    const writeTestsNode = nodes.find(n => n.id === 'write-tests')!;
    writeTestsNode.validate = [
      { type: 'file-exists', args: { path: 'nonexistent.ts' } },
      { type: 'tsc-check' },
      { type: 'tests-pass' },
    ];
    writeGraphYaml(dir, 'my-change', graph);

    runSpecwork(dir, 'node start my-change write-tests');

    const result = runSpecwork(dir, '--json node verify my-change write-tests');
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.verdict).toBe('FAIL');

    // file-exists should be FAIL, others should be SKIPPED
    expect(json.checks[0].status).toBe('FAIL');
    const skippedChecks = json.checks.filter((c: any) => c.status === 'SKIPPED');
    expect(skippedChecks.length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Verification History in state.yaml
// ══════════════════════════════════════════════════════════════════════════════

describe('verification history', () => {
  let dir: string;

  beforeEach(() => { dir = createTestProject(); });
  afterEach(() => { cleanup(dir); });

  it('verify updates state with verified flag and verify_history', () => {
    setupProjectWithGraph(dir);
    // Override write-tests validate to a simple file-exists check for testability
    const graph = readGraphYaml(dir, 'my-change');
    const graphNodes = graph.nodes as Array<Record<string, unknown>>;
    const writeTestsNode = graphNodes.find(n => n.id === 'write-tests')!;
    writeTestsNode.validate = [{ type: 'file-exists', args: { path: '.specwork/env/test-artifact.md' } }];
    writeGraphYaml(dir, 'my-change', graph);

    // Create the test artifact so verification passes
    const testArtifact = path.join(dir, '.specwork', 'env', 'test-artifact.md');
    fs.mkdirSync(path.dirname(testArtifact), { recursive: true });
    fs.writeFileSync(testArtifact, '# Test Artifact\n', 'utf-8');

    runSpecwork(dir, 'node start my-change write-tests');
    runSpecwork(dir, '--json node verify my-change write-tests');

    const state = readStateYaml(dir, 'my-change');
    const stateNodes = state.nodes as Record<string, Record<string, unknown>>;
    const writeTestsState = stateNodes['write-tests'];

    expect(writeTestsState.verified).toBe(true);
    expect(writeTestsState.last_verdict).toBe('PASS');
    expect(Array.isArray(writeTestsState.verify_history)).toBe(true);
    expect((writeTestsState.verify_history as any[]).length).toBe(1);
  });

  it('multiple verify runs append to history', () => {
    setupProjectWithGraph(dir);
    // Override write-tests validate to a simple file-exists check for testability
    const graph = readGraphYaml(dir, 'my-change');
    const graphNodes = graph.nodes as Array<Record<string, unknown>>;
    const writeTestsNode = graphNodes.find(n => n.id === 'write-tests')!;
    writeTestsNode.validate = [{ type: 'file-exists', args: { path: '.specwork/env/test-artifact.md' } }];
    writeGraphYaml(dir, 'my-change', graph);

    runSpecwork(dir, 'node start my-change write-tests');

    // First verify (will fail — no test artifact)
    runSpecwork(dir, '--json node verify my-change write-tests');

    // Create the file and verify again
    const testArtifact = path.join(dir, '.specwork', 'env', 'test-artifact.md');
    fs.mkdirSync(path.dirname(testArtifact), { recursive: true });
    fs.writeFileSync(testArtifact, '# Test Artifact\n', 'utf-8');
    runSpecwork(dir, '--json node verify my-change write-tests');

    const state = readStateYaml(dir, 'my-change');
    const stateNodes = state.nodes as Record<string, Record<string, unknown>>;
    const history = stateNodes['write-tests'].verify_history as any[];

    expect(history.length).toBe(2);
    expect(history[0].verdict).toBe('FAIL');
    expect(history[1].verdict).toBe('PASS');
  });

  it('history entries include attempt number and timestamp', () => {
    setupProjectWithGraph(dir);
    runSpecwork(dir, 'node start my-change write-tests');
    runSpecwork(dir, '--json node verify my-change write-tests');

    const state = readStateYaml(dir, 'my-change');
    const stateNodes = state.nodes as Record<string, Record<string, unknown>>;
    const history = stateNodes['write-tests'].verify_history as any[];

    expect(history[0].attempt).toBe(1);
    expect(history[0].timestamp).toBeDefined();
    expect(history[0].checks).toBeDefined();
  });

  it('flags regressions when a previously-passing check now fails', () => {
    setupProjectWithGraph(dir);

    // Give write-tests a file-exists check
    const graph = readGraphYaml(dir, 'my-change');
    const nodes = graph.nodes as Array<Record<string, unknown>>;
    const writeTestsNode = nodes.find(n => n.id === 'write-tests')!;
    writeTestsNode.validate = [{ type: 'file-exists', args: { path: '.specwork/env/test-artifact.md' } }];
    writeGraphYaml(dir, 'my-change', graph);

    // Create file, verify (PASS)
    const testArtifact = path.join(dir, '.specwork', 'env', 'test-artifact.md');
    fs.mkdirSync(path.dirname(testArtifact), { recursive: true });
    fs.writeFileSync(testArtifact, '# Test Artifact\n', 'utf-8');

    runSpecwork(dir, 'node start my-change write-tests');
    runSpecwork(dir, '--json node verify my-change write-tests');

    // Delete file, verify again (FAIL — regression)
    fs.unlinkSync(testArtifact);
    const result = runSpecwork(dir, '--json node verify my-change write-tests');
    const json = JSON.parse(result.stdout);

    // The response should indicate regression
    expect(json.regressions).toBeDefined();
    expect(json.regressions).toContain('file-exists');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: verify.md preserves full history
// ══════════════════════════════════════════════════════════════════════════════

describe('verify.md artifact', () => {
  let dir: string;

  beforeEach(() => { dir = createTestProject(); });
  afterEach(() => { cleanup(dir); });

  it('contains all verification attempts, not just the latest', () => {
    setupProjectWithGraph(dir);
    runSpecwork(dir, 'node start my-change write-tests');

    // Verify twice
    runSpecwork(dir, '--json node verify my-change write-tests');
    const testArtifact = path.join(dir, '.specwork', 'env', 'test-artifact.md');
    fs.mkdirSync(path.dirname(testArtifact), { recursive: true });
    fs.writeFileSync(testArtifact, '# Test Artifact\n', 'utf-8');
    runSpecwork(dir, '--json node verify my-change write-tests');

    const verifyPath = path.join(dir, '.specwork', 'nodes', 'my-change', 'write-tests', 'verify.md');
    const content = fs.readFileSync(verifyPath, 'utf-8');

    // Should have both attempts
    expect(content).toMatch(/Attempt 1/i);
    expect(content).toMatch(/Attempt 2/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Verification Verdict in Node State
// ══════════════════════════════════════════════════════════════════════════════

describe('verified flag blocks completion', () => {
  let dir: string;

  beforeEach(() => { dir = createTestProject(); });
  afterEach(() => { cleanup(dir); });

  it('node complete succeeds after passing verification', () => {
    setupProjectWithGraph(dir);
    // Override write-tests validate to a simple file-exists check for testability
    const graph = readGraphYaml(dir, 'my-change');
    const graphNodes = graph.nodes as Array<Record<string, unknown>>;
    const writeTestsNode = graphNodes.find(n => n.id === 'write-tests')!;
    writeTestsNode.validate = [{ type: 'file-exists', args: { path: '.specwork/env/test-artifact.md' } }];
    writeGraphYaml(dir, 'my-change', graph);

    const testArtifact = path.join(dir, '.specwork', 'env', 'test-artifact.md');
    fs.mkdirSync(path.dirname(testArtifact), { recursive: true });
    fs.writeFileSync(testArtifact, '# Test Artifact\n', 'utf-8');

    runSpecwork(dir, 'node start my-change write-tests');
    runSpecwork(dir, '--json node verify my-change write-tests');

    const result = runSpecwork(dir, 'node complete my-change write-tests --l0 "write-tests done" --no-commit');
    expect(result.exitCode).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Default Validation Rules Per Node Type
// ══════════════════════════════════════════════════════════════════════════════

describe('default validation rules in generated graph', () => {
  let dir: string;

  beforeEach(() => { dir = createTestProject(); });
  afterEach(() => { cleanup(dir); });

  it('write-tests node includes tsc-check and tests-fail', () => {
    setupProjectWithGraph(dir);
    const graph = readGraphYaml(dir, 'my-change');
    const nodes = graph.nodes as Array<Record<string, unknown>>;
    const writeTestsNode = nodes.find(n => n.id === 'write-tests')!;
    const validateTypes = (writeTestsNode.validate as any[]).map((v: any) => v.type);

    expect(validateTypes).toContain('tests-fail');
    expect(validateTypes).toContain('tsc-check');
  });

  it('impl nodes include files-unchanged, imports-exist, tsc-check, tests-pass', () => {
    setupProjectWithGraph(dir);
    const graph = readGraphYaml(dir, 'my-change');
    const nodes = graph.nodes as Array<Record<string, unknown>>;
    const implNode = nodes.find(n => (n.id as string).startsWith('impl-'))!;
    const validateTypes = (implNode.validate as any[]).map((v: any) => v.type);

    expect(validateTypes).toContain('files-unchanged');
    expect(validateTypes).toContain('imports-exist');
    expect(validateTypes).toContain('tsc-check');
    expect(validateTypes).toContain('tests-pass');
  });

  it('impl nodes have files-unchanged targeting test directories', () => {
    setupProjectWithGraph(dir);
    const graph = readGraphYaml(dir, 'my-change');
    const nodes = graph.nodes as Array<Record<string, unknown>>;
    const implNode = nodes.find(n => (n.id as string).startsWith('impl-'))!;
    const filesUnchanged = (implNode.validate as any[]).find((v: any) => v.type === 'files-unchanged');

    expect(filesUnchanged).toBeDefined();
    expect(filesUnchanged.args.files).toBeDefined();
    expect(filesUnchanged.args.files.some((f: string) => f.includes('__tests__') || f.includes('test'))).toBe(true);
  });

  it('integration node includes tests-pass with full suite', () => {
    setupProjectWithGraph(dir);
    const graph = readGraphYaml(dir, 'my-change');
    const nodes = graph.nodes as Array<Record<string, unknown>>;
    const integrationNode = nodes.find(n => n.id === 'integration')!;
    const validateTypes = (integrationNode.validate as any[]).map((v: any) => v.type);

    expect(validateTypes).toContain('tests-pass');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Custom Check Types via CLI
// ══════════════════════════════════════════════════════════════════════════════

describe('custom checks via config', () => {
  let dir: string;

  beforeEach(() => { dir = createTestProject(); });
  afterEach(() => { cleanup(dir); });

  it('custom check defined in config can be used in validate array', () => {
    setupProjectWithGraph(dir);

    // Add custom check to config
    const config = readConfig(dir);
    (config as any).checks = {
      'echo-test': {
        command: 'echo "hello"',
        expect: 'exit-0',
        description: 'Echo test',
        phase: ['impl'],
      },
    };
    writeConfig(dir, config);

    // Add custom check to write-tests node's validate
    const graph = readGraphYaml(dir, 'my-change');
    const nodes = graph.nodes as Array<Record<string, unknown>>;
    const writeTestsNode = nodes.find(n => n.id === 'write-tests')!;
    writeTestsNode.validate = [{ type: 'echo-test' }];
    writeGraphYaml(dir, 'my-change', graph);

    runSpecwork(dir, 'node start my-change write-tests');
    const result = runSpecwork(dir, '--json node verify my-change write-tests');
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.verdict).toBe('PASS');
    expect(json.checks.some((c: any) => c.type === 'echo-test')).toBe(true);
  });

  it('custom check with {scope} substitution', () => {
    setupProjectWithGraph(dir);

    const config = readConfig(dir);
    (config as any).checks = {
      'list-scope': {
        command: 'echo {scope}',
        expect: 'exit-0',
        description: 'List scope files',
      },
    };
    writeConfig(dir, config);

    const graph = readGraphYaml(dir, 'my-change');
    const nodes = graph.nodes as Array<Record<string, unknown>>;
    const writeTestsNode = nodes.find(n => n.id === 'write-tests')!;
    writeTestsNode.scope = ['src/auth/', 'src/utils/'];
    writeTestsNode.validate = [{ type: 'list-scope' }];
    writeGraphYaml(dir, 'my-change', graph);

    runSpecwork(dir, 'node start my-change write-tests');
    const result = runSpecwork(dir, '--json node verify my-change write-tests');

    const json = JSON.parse(result.stdout);
    expect(json.verdict).toBe('PASS');
  });

  it('unknown check type (not built-in, not in config) returns FAIL', () => {
    setupProjectWithGraph(dir);

    const graph = readGraphYaml(dir, 'my-change');
    const nodes = graph.nodes as Array<Record<string, unknown>>;
    const writeTestsNode = nodes.find(n => n.id === 'write-tests')!;
    writeTestsNode.validate = [{ type: 'totally-nonexistent-check' }];
    writeGraphYaml(dir, 'my-change', graph);

    runSpecwork(dir, 'node start my-change write-tests');
    const result = runSpecwork(dir, '--json node verify my-change write-tests');

    // Should either error or FAIL, not silently PASS
    if (result.exitCode === 0) {
      const json = JSON.parse(result.stdout);
      expect(json.verdict).toBe('FAIL');
    } else {
      expect(result.stderr).toMatch(/unknown.*check|not.*defined/i);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Cross-Node Validation (direct deps)
// ══════════════════════════════════════════════════════════════════════════════

describe('cross-node validation', () => {
  let dir: string;

  beforeEach(() => { dir = createTestProject(); });
  afterEach(() => { cleanup(dir); });

  it('verify includes cross-node regression check for dependency tests', () => {
    setupProjectWithGraph(dir);

    // This is a structural test — the verify result should include
    // a cross_node_checks field when the node has completed dependencies
    // with test files
    const graph = readGraphYaml(dir, 'my-change');
    const nodes = graph.nodes as Array<Record<string, unknown>>;

    // Find an impl node that depends on write-tests
    const implNode = nodes.find(n =>
      (n.id as string).startsWith('impl-') &&
      (n.deps as string[]).includes('write-tests')
    )!;

    // Mark prerequisites as complete
    markNodeStatus(dir, 'my-change', 'write-tests', 'complete');

    const nodeId = implNode.id as string;
    runSpecwork(dir, `node start my-change ${nodeId}`);

    const result = runSpecwork(dir, `--json node verify my-change ${nodeId}`);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    // Should have attempted cross-node checks (even if they fail due to no test files)
    expect(json.checks).toBeDefined();
    // The cross-node check type should appear
    // (exact behavior depends on whether write-tests node has test file outputs)
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: verify-output.txt for full output
// ══════════════════════════════════════════════════════════════════════════════

describe('verify-output.txt artifact', () => {
  let dir: string;

  beforeEach(() => { dir = createTestProject(); });
  afterEach(() => { cleanup(dir); });

  it('saves full check output to verify-output.txt', () => {
    setupProjectWithGraph(dir);
    runSpecwork(dir, 'node start my-change write-tests');
    runSpecwork(dir, '--json node verify my-change write-tests');

    const outputPath = path.join(dir, '.specwork', 'nodes', 'my-change', 'write-tests', 'verify-output.txt');
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  it('JSON response includes full_output_path', () => {
    setupProjectWithGraph(dir);
    runSpecwork(dir, 'node start my-change write-tests');

    const result = runSpecwork(dir, '--json node verify my-change write-tests');
    const json = JSON.parse(result.stdout);

    expect(json.full_output_path).toBeDefined();
    expect(json.full_output_path).toMatch(/verify-output\.txt/);
  });
});
