import { describe, it, expect, beforeEach } from 'vitest';
import { generateGraph } from '../../core/graph-generator.js';
import { ensureDir } from '../../io/filesystem.js';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ── Helpers ──────────────────────────────────────────────────────────────────

let tmpDir: string;
let root: string;

function writeChange(change: string, files: Record<string, string>) {
  const changeDir = path.join(root, '.specwork', 'changes', change);
  ensureDir(changeDir);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(changeDir, name), content);
  }
}

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'specwork-gen-test-'));
  root = tmpDir;
  ensureDir(path.join(root, '.specwork', 'changes'));
});

// ── Node ID Tests ────────────────────────────────────────────────────────────

describe('node ID generation', () => {
  it('should produce group-level IDs (impl-{group})', () => {
    writeChange('test', {
      'tasks.md': `## 1. Auth Module
- [ ] 1.1 Create authentication service with JWT token validation
- [ ] 1.2 Add rate limiting middleware

## 2. Database Layer
- [ ] 2.1 Create database connection pool
- [ ] 2.2 Add migration runner
`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');
    const implNodes = graph.nodes.filter(n => n.id.startsWith('impl-'));

    // Multi-task groups collapse to one node per group
    expect(implNodes[0].id).toBe('impl-1');
    expect(implNodes[1].id).toBe('impl-2');
    expect(implNodes).toHaveLength(2);
    // Each should have sub_tasks
    expect(implNodes[0].sub_tasks).toHaveLength(2);
    expect(implNodes[1].sub_tasks).toHaveLength(2);
  });

  it('should keep full description in the description field', () => {
    writeChange('test', {
      'tasks.md': `## 1. Setup
- [ ] 1.1 Create authentication service with JWT token validation
`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');
    const implNode = graph.nodes.find(n => n.id === 'impl-1');
    expect(implNode).toBeDefined();
    expect(implNode!.description).toBeDefined();
  });

  it('should produce IDs under 20 characters', () => {
    writeChange('test', {
      'tasks.md': `## 1. Very Long Group Name That Goes On Forever
- [ ] 1.1 Create an extremely detailed and verbose task description that would normally produce a very long slug
- [ ] 1.2 Another ridiculously long task name
`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');
    for (const node of graph.nodes) {
      if (node.id.startsWith('impl-')) {
        expect(node.id.length).toBeLessThanOrEqual(20);
      }
    }
  });
});

// ── Parallel Dependency Tests ────────────────────────────────────────────────

describe('parallel group dependencies', () => {
  it('should make each collapsed group depend on write-tests', () => {
    writeChange('test', {
      'tasks.md': `## 1. Frontend
- [ ] 1.1 Build login page
- [ ] 1.2 Build dashboard

## 2. Backend
- [ ] 2.1 Create API routes
- [ ] 2.2 Add auth middleware

## 3. Tests
- [ ] 3.1 Write E2E tests
`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');

    // Each collapsed group node depends on write-tests
    const impl1 = graph.nodes.find(n => n.id === 'impl-1');
    const impl2 = graph.nodes.find(n => n.id === 'impl-2');
    const impl3 = graph.nodes.find(n => n.id === 'impl-3');

    expect(impl1!.deps).toContain('write-tests');
    expect(impl2!.deps).toContain('write-tests');
    expect(impl3!.deps).toContain('write-tests');
  });

  it('should collapse tasks within the same group into sub_tasks', () => {
    writeChange('test', {
      'tasks.md': `## 1. Module A
- [ ] 1.1 First task
- [ ] 1.2 Second task
- [ ] 1.3 Third task
`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');

    const impl1 = graph.nodes.find(n => n.id === 'impl-1');
    expect(impl1).toBeDefined();
    expect(impl1!.sub_tasks).toHaveLength(3);
    expect(impl1!.deps).toEqual(['write-tests']);
  });

  it('should make integration depend on each collapsed group node', () => {
    writeChange('test', {
      'tasks.md': `## 1. Frontend
- [ ] 1.1 Task A
- [ ] 1.2 Task B

## 2. Backend
- [ ] 2.1 Task C
- [ ] 2.2 Task D
- [ ] 2.3 Task E
`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');
    const integration = graph.nodes.find(n => n.id === 'integration');

    // Integration depends on each collapsed group
    expect(integration!.deps).toContain('impl-1');
    expect(integration!.deps).toContain('impl-2');
    expect(integration!.deps).toHaveLength(2);
  });
});

// ── Spec Input Discovery ────────────────────────────────────────────────────

describe('spec input discovery', () => {
  it('should include spec files as inputs to write-tests node', () => {
    writeChange('test', {
      'tasks.md': `## 1. Core\n- [ ] 1.1 Do something\n`,
      'proposal.md': '',
      'design.md': '',
    });
    // Create specs directory with spec files
    const specsDir = path.join(root, '.specwork', 'changes', 'test', 'specs');
    ensureDir(specsDir);
    writeFileSync(path.join(specsDir, 'auth.md'), '### Requirement: Auth\n');
    writeFileSync(path.join(specsDir, 'rate-limit.md'), '### Requirement: Rate Limit\n');

    const graph = generateGraph(root, 'test');
    const writeTests = graph.nodes.find(n => n.id === 'write-tests');

    expect(writeTests!.inputs).toContain('.specwork/changes/test/specs/auth.md');
    expect(writeTests!.inputs).toContain('.specwork/changes/test/specs/rate-limit.md');
  });

  it('should work when specs directory is empty', () => {
    writeChange('test', {
      'tasks.md': `## 1. Core\n- [ ] 1.1 Do something\n`,
      'proposal.md': '',
      'design.md': '',
    });
    const specsDir = path.join(root, '.specwork', 'changes', 'test', 'specs');
    ensureDir(specsDir);

    const graph = generateGraph(root, 'test');
    // Should still generate without error
    expect(graph.nodes.length).toBeGreaterThanOrEqual(3);
  });

  it('should work when specs directory does not exist', () => {
    writeChange('test', {
      'tasks.md': `## 1. Core\n- [ ] 1.1 Do something\n`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');
    // Should still generate without error
    expect(graph.nodes.length).toBeGreaterThanOrEqual(3);
  });

  it('should ignore non-md files in specs directory', () => {
    writeChange('test', {
      'tasks.md': `## 1. Core\n- [ ] 1.1 Do something\n`,
      'proposal.md': '',
      'design.md': '',
    });
    const specsDir = path.join(root, '.specwork', 'changes', 'test', 'specs');
    ensureDir(specsDir);
    writeFileSync(path.join(specsDir, 'auth.md'), '### Requirement: Auth\n');
    writeFileSync(path.join(specsDir, '.gitkeep'), '');
    writeFileSync(path.join(specsDir, 'notes.txt'), 'not a spec');

    const graph = generateGraph(root, 'test');
    const writeTests = graph.nodes.find(n => n.id === 'write-tests');

    const specInputs = writeTests!.inputs.filter(i => i.includes('specs/'));
    expect(specInputs).toHaveLength(1);
    expect(specInputs[0]).toContain('auth.md');
  });
});

// ── Edge Cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('should handle single group correctly', () => {
    writeChange('test', {
      'tasks.md': `## 1. Only Group
- [ ] 1.1 Only task
`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');
    const impl = graph.nodes.find(n => n.id === 'impl-1');
    expect(impl!.deps).toEqual(['write-tests']);

    const integration = graph.nodes.find(n => n.id === 'integration');
    expect(integration!.deps).toContain('impl-1');
  });

  it('should handle empty tasks gracefully', () => {
    writeChange('test', {
      'tasks.md': `## 1. Empty Group\n`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');
    // Should have write-tests, integration (no impl nodes)
    expect(graph.nodes).toHaveLength(2);
  });
});

// ── Sub-Bullet Scope Extraction ─────────────────────────────────────────────

describe('sub-bullet scope extraction', () => {
  it('should extract file paths from indented sub-bullets into node scope', () => {
    writeChange('test', {
      'tasks.md': `## 1. Core Changes
- [ ] 1.1 Refactor the parser
  - Update src/core/parser.ts to handle new syntax
  - Modify src/core/lexer.ts for token changes
`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');
    const impl = graph.nodes.find(n => n.id === 'impl-1');
    expect(impl).toBeDefined();
    expect(impl!.scope).toContain('src/core/parser.ts');
    expect(impl!.scope).toContain('src/core/lexer.ts');
  });

  it('should stop collecting sub-bullets at next checkbox', () => {
    writeChange('test', {
      'tasks.md': `## 1. Module
- [ ] 1.1 First task
  - Change src/core/first.ts
- [ ] 1.2 Second task
  - Change src/core/second.ts
`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');
    const impl = graph.nodes.find(n => n.id === 'impl-1');
    expect(impl).toBeDefined();
    // Both sub-bullet paths should appear in the collapsed group scope
    expect(impl!.scope).toContain('src/core/first.ts');
    expect(impl!.scope).toContain('src/core/second.ts');
  });

  it('should stop collecting sub-bullets at next section header', () => {
    writeChange('test', {
      'tasks.md': `## 1. First Group
- [ ] 1.1 Task A
  - Touches src/core/alpha.ts

## 2. Second Group
- [ ] 2.1 Task B
  - Touches src/core/beta.ts
`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');
    const impl1 = graph.nodes.find(n => n.id === 'impl-1');
    const impl2 = graph.nodes.find(n => n.id === 'impl-2');
    expect(impl1!.scope).toContain('src/core/alpha.ts');
    expect(impl1!.scope).not.toContain('src/core/beta.ts');
    expect(impl2!.scope).toContain('src/core/beta.ts');
    expect(impl2!.scope).not.toContain('src/core/alpha.ts');
  });

  it('should merge file paths from rawLine and sub-bullets', () => {
    writeChange('test', {
      'tasks.md': `## 1. Core
- [ ] 1.1 Update src/core/main.ts for new API
  - Also update src/core/helpers.ts
`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');
    const impl = graph.nodes.find(n => n.id === 'impl-1');
    expect(impl!.scope).toContain('src/core/main.ts');
    expect(impl!.scope).toContain('src/core/helpers.ts');
  });

  it('should deduplicate file paths across rawLine and sub-bullets', () => {
    writeChange('test', {
      'tasks.md': `## 1. Core
- [ ] 1.1 Modify src/core/parser.ts
  - Further changes to src/core/parser.ts
  - Also update src/core/utils.ts
`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');
    const impl = graph.nodes.find(n => n.id === 'impl-1');
    // src/core/parser.ts should appear only once despite being in both rawLine and sub-bullet
    const parserCount = impl!.scope.filter(p => p === 'src/core/parser.ts').length;
    expect(parserCount).toBe(1);
    expect(impl!.scope).toContain('src/core/utils.ts');
  });

  it('should not require proposal.md or design.md reads for scope (no allContext dependency)', () => {
    // If allContext is removed, generating a graph should work
    // without proposal.md or design.md content affecting scope
    writeChange('test', {
      'tasks.md': `## 1. Core
- [ ] 1.1 Update src/core/engine.ts
  - Modify src/core/runner.ts
`,
      'proposal.md': 'This mentions src/unrelated/file.ts which should NOT appear in scope',
      'design.md': 'This mentions src/another/unrelated.ts which should NOT appear in scope',
    });

    const graph = generateGraph(root, 'test');
    const impl = graph.nodes.find(n => n.id === 'impl-1');
    expect(impl!.scope).toContain('src/core/engine.ts');
    expect(impl!.scope).toContain('src/core/runner.ts');
    // Files mentioned only in proposal/design should NOT be in impl scope
    expect(impl!.scope).not.toContain('src/unrelated/file.ts');
    expect(impl!.scope).not.toContain('src/another/unrelated.ts');
  });

  it('should have scope from rawLine only when task has no sub-bullets', () => {
    writeChange('test', {
      'tasks.md': `## 1. Core
- [ ] 1.1 Update src/core/parser.ts for new syntax
`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');
    const impl = graph.nodes.find(n => n.id === 'impl-1');
    expect(impl).toBeDefined();
    // Scope should come only from rawLine
    expect(impl!.scope).toContain('src/core/parser.ts');
    // Should have exactly 1 scope entry (no phantom sub-bullet paths)
    expect(impl!.scope).toHaveLength(1);
  });
});

