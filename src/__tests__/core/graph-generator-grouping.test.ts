import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'specwork-grouping-test-'));
  root = tmpDir;
  ensureDir(path.join(root, '.specwork', 'changes'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Auto-group from Section Headers
// ══════════════════════════════════════════════════════════════════════════════

describe('auto-group from section headers', () => {
  it('three tasks in one section collapse to one node (not 3)', () => {
    // Spec: tasks under same ## section → one GraphNode
    writeChange('test', {
      'tasks.md': `## 1. Type System and Config
- [ ] 1.1 Add max_concurrent field to SpecworkConfig.execution src/types/config.ts
- [ ] 1.2 Add group and sub_tasks fields to GraphNode src/types/graph.ts
- [ ] 1.3 Add current_wave to WorkflowState src/types/state.ts
`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');
    const implNodes = graph.nodes.filter(n => n.id.startsWith('impl-'));

    // Current behavior: 3 individual nodes. New behavior: 1 collapsed node.
    expect(implNodes).toHaveLength(1);
  });

  it('collapsed node carries sub_tasks array with all task descriptions', () => {
    writeChange('test', {
      'tasks.md': `## 1. Type System
- [ ] 1.1 Add max_concurrent to config src/types/config.ts
- [ ] 1.2 Add group field to GraphNode src/types/graph.ts
- [ ] 1.3 Add current_wave to state src/types/state.ts
`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');
    const groupNode = graph.nodes.find(n => n.id.startsWith('impl-'))!;

    // sub_tasks should be populated on the collapsed node
    expect((groupNode as any).sub_tasks).toBeDefined();
    expect((groupNode as any).sub_tasks).toHaveLength(3);
    expect((groupNode as any).sub_tasks[0]).toContain('max_concurrent');
  });

  it('collapsed node scope is union of all task scopes', () => {
    writeChange('test', {
      'tasks.md': `## 1. Type System
- [ ] 1.1 Update config types src/types/config.ts
- [ ] 1.2 Update graph types src/types/graph.ts
- [ ] 1.3 Update state types src/types/state.ts
`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');
    const implNodes = graph.nodes.filter(n => n.id.startsWith('impl-'));

    // With collapsing, there should be 1 node with combined scope
    expect(implNodes).toHaveLength(1);
    expect(implNodes[0].scope).toContain('src/types/config.ts');
    expect(implNodes[0].scope).toContain('src/types/graph.ts');
    expect(implNodes[0].scope).toContain('src/types/state.ts');
  });

  it('tasks in different sections become separate collapsed nodes', () => {
    // Spec: different ## sections → separate collapsed nodes
    writeChange('test', {
      'tasks.md': `## 1. Type System
- [ ] 1.1 Add types src/types/config.ts
- [ ] 1.2 Add more types src/types/graph.ts

## 2. Wave Execution
- [ ] 2.1 Add getNextWave src/core/graph-walker.ts
- [ ] 2.2 Add dispatchWave src/core/state-machine.ts
`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');
    const implNodes = graph.nodes.filter(n => n.id.startsWith('impl-'));

    // Should be 2 collapsed nodes (one per section), not 4 individual nodes
    expect(implNodes).toHaveLength(2);
  });

  it('single-task section emits node without sub_tasks alongside multi-task collapsed node', () => {
    // Spec: single-task section → no sub_tasks; multi-task → collapsed
    // Both behaviors must coexist in the same graph
    writeChange('test', {
      'tasks.md': `## 1. Group Section
- [ ] 1.1 Task A src/core/a.ts
- [ ] 1.2 Task B src/core/b.ts

## 2. Solo Section
- [ ] 2.1 Fix the bug src/core/bug.ts
`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');
    const implNodes = graph.nodes.filter(n => n.id.startsWith('impl-'));

    // Section 1: 2 tasks → 1 collapsed node with sub_tasks
    // Section 2: 1 task → 1 normal node without sub_tasks
    expect(implNodes).toHaveLength(2);

    const groupNode = implNodes.find(n => (n as any).sub_tasks?.length === 2);
    const soloNode = implNodes.find(n => !(n as any).sub_tasks);

    expect(groupNode).toBeDefined();
    expect((groupNode as any).group).toBeDefined();

    expect(soloNode).toBeDefined();
    expect((soloNode as any).group).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: group Field on Generated Nodes
// ══════════════════════════════════════════════════════════════════════════════

describe('group field on generated nodes', () => {
  it('collapsed node has group set to slugified section header', () => {
    // Spec: group: "wave-based-execution" for "## 2. Wave-based Execution"
    writeChange('test', {
      'tasks.md': `## 2. Wave-based Execution
- [ ] 2.1 Add wave logic src/core/graph-walker.ts
- [ ] 2.2 Add wave state src/core/state-machine.ts
`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');
    const implNodes = graph.nodes.filter(n => n.id.startsWith('impl-'));

    // Should be 1 collapsed node with group slug
    expect(implNodes).toHaveLength(1);
    expect((implNodes[0] as any).group).toBe('wave-based-execution');
  });

  it('multi-task section node has group field set (proves generator produces it)', () => {
    // Verify the generator actively sets the group field on collapsed nodes
    writeChange('test', {
      'tasks.md': `## 1. Type System
- [ ] 1.1 Add types src/types/a.ts
- [ ] 1.2 More types src/types/b.ts
`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');
    const implNodes = graph.nodes.filter(n => n.id.startsWith('impl-'));

    // Should be 1 collapsed node
    expect(implNodes).toHaveLength(1);
    // Must have the group field actively set
    expect((implNodes[0] as any).group).toBe('type-system');
    expect(typeof (implNodes[0] as any).group).toBe('string');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: group: null Opt-Out
// ══════════════════════════════════════════════════════════════════════════════

describe('group opt-out via annotation', () => {
  it('opted-out task becomes its own node separate from section group', () => {
    // Spec: 3 tasks, one opted out → 2 nodes (1 group of 2 + 1 isolated)
    writeChange('test', {
      'tasks.md': `## 1. Type System
- [ ] 1.1 Add config types src/types/config.ts
- [ ] 1.2 Add graph types src/types/graph.ts <!-- group: null -->
- [ ] 1.3 Add state types src/types/state.ts
`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');
    const implNodes = graph.nodes.filter(n => n.id.startsWith('impl-'));

    // Should produce 2 nodes: group (1.1+1.3) + isolated (1.2)
    expect(implNodes).toHaveLength(2);

    const groupNode = implNodes.find(n => (n as any).group === 'type-system');
    const isolatedNode = implNodes.find(n => !(n as any).group);

    expect(groupNode).toBeDefined();
    expect((groupNode as any).sub_tasks).toHaveLength(2);

    expect(isolatedNode).toBeDefined();
    expect((isolatedNode as any).sub_tasks).toBeUndefined();
  });

  it('opted-out node has correct dependencies', () => {
    // Spec: opted-out task gets same deps as it would in group
    writeChange('test', {
      'tasks.md': `## 1. First Section
- [ ] 1.1 First task src/core/a.ts <!-- group: null -->
- [ ] 1.2 Second task src/core/b.ts
- [ ] 1.3 Third task src/core/c.ts
`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');
    const implNodes = graph.nodes.filter(n => n.id.startsWith('impl-'));

    // Should be 2 nodes, both depending on write-tests
    expect(implNodes).toHaveLength(2);
    for (const node of implNodes) {
      expect(node.deps).toContain('write-tests');
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Requirement: Backward-compatible Graph Schema
// ══════════════════════════════════════════════════════════════════════════════

describe('backward compatibility', () => {
  it('multi-task sections now produce collapsed nodes (new behavior check)', () => {
    // This verifies the NEW grouping behavior is active.
    // Old behavior: 3 nodes. New behavior: 1 collapsed node.
    writeChange('test', {
      'tasks.md': `## 1. Auth Module
- [ ] 1.1 Create auth service src/core/auth.ts
- [ ] 1.2 Add rate limiting src/core/rate-limit.ts
- [ ] 1.3 Add token refresh src/core/token.ts
`,
      'proposal.md': '',
      'design.md': '',
    });

    const graph = generateGraph(root, 'test');
    const implNodes = graph.nodes.filter(n => n.id.startsWith('impl-'));

    // With auto-grouping, 3 tasks in 1 section → 1 collapsed node
    expect(implNodes).toHaveLength(1);
    expect((implNodes[0] as any).sub_tasks).toHaveLength(3);
    expect((implNodes[0] as any).group).toBe('auth-module');
  });
});
