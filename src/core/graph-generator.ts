import path from 'node:path';
import fs from 'node:fs';
import type { Graph, GraphNode, ValidationRule } from '../types/graph.js';
import { readMarkdown } from '../io/filesystem.js';
import { changeDir } from '../utils/paths.js';

interface ParsedTask {
  id: string;
  description: string;
  group: string;
  groupIndex: number;
  taskIndex: number;
  rawLine: string;
  optOut: boolean;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
}

function extractFilePaths(text: string): string[] {
  // Match patterns like src/foo/bar.ts or relative paths ending in known extensions
  const filePattern = /(?:^|\s)((?:src|lib|test|tests|__tests__|bin|scripts)\/[\w/.-]+\.\w+)/gm;
  const paths: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = filePattern.exec(text)) !== null) {
    paths.push(match[1]);
  }
  return [...new Set(paths)];
}

function parseTasks(tasksContent: string): ParsedTask[] {
  const lines = tasksContent.split('\n');
  const tasks: ParsedTask[] = [];
  let currentGroup = 'default';
  let currentGroupIndex = 0;
  let taskIndexInGroup = 0;

  for (const line of lines) {
    // Section header: ## 1. Group Name or ## Group Name
    const sectionMatch = /^##\s+(?:\d+\.\s+)?(.+)/.exec(line);
    if (sectionMatch) {
      currentGroup = sectionMatch[1].trim();
      currentGroupIndex++;
      taskIndexInGroup = 0;
      continue;
    }

    // Skip convention lines (write-tests: and integration: prefixed)
    if (/^-\s+\[\s*[ x]?\s*\]\s+(?:write-tests|integration):/.test(line)) {
      continue;
    }

    // Checkbox task: - [ ] 1.1 Task description or - [ ] Task description
    const taskMatch = /^-\s+\[\s*[ x]?\s*\]\s+(?:\d+(?:\.\d+)?\s+)?(.+)/.exec(line);
    if (taskMatch) {
      let description = taskMatch[1].trim();
      const optOut = /<!--\s*group:\s*null\s*-->/.test(description);
      if (optOut) {
        description = description.replace(/<!--\s*group:\s*null\s*-->/, '').trim();
      }
      taskIndexInGroup++;
      const id = `impl-${currentGroupIndex}-${taskIndexInGroup}`;
      tasks.push({
        id,
        description,
        group: currentGroup,
        groupIndex: currentGroupIndex,
        taskIndex: taskIndexInGroup,
        rawLine: line,
        optOut,
      });
    }
  }

  return tasks;
}

export function generateGraph(root: string, change: string): Graph {
  const dir = changeDir(root, change);

  const tasksContent = readMarkdown(path.join(dir, 'tasks.md'));
  const proposalContent = readMarkdown(path.join(dir, 'proposal.md'));
  const designContent = readMarkdown(path.join(dir, 'design.md'));

  const allContext = [tasksContent, proposalContent, designContent].join('\n');

  const tasks = parseTasks(tasksContent);
  const now = new Date().toISOString();

  const nodes: GraphNode[] = [];

  // First node: snapshot (deterministic)
  const snapshotNode: GraphNode = {
    id: 'snapshot',
    type: 'deterministic',
    description: 'Capture environment snapshot (file tree, deps, types)',
    command: 'specwork snapshot',
    deps: [],
    inputs: [],
    outputs: ['.specwork/env/snapshot.md'],
    scope: [],
    validate: [{ type: 'file-exists', args: { path: '.specwork/env/snapshot.md' } }],
    retry: 2,
  };
  nodes.push(snapshotNode);

  // Discover spec files from change's specs/ directory
  const specsDir = path.join(dir, 'specs');
  const specInputs: string[] = [];
  if (fs.existsSync(specsDir)) {
    const specFiles = fs.readdirSync(specsDir).filter(f => f.endsWith('.md'));
    for (const file of specFiles) {
      specInputs.push(`.specwork/changes/${change}/specs/${file}`);
    }
  }

  // Second node: write-tests (llm, gate: human)
  const writeTestsNode: GraphNode = {
    id: 'write-tests',
    type: 'llm',
    description: 'Write tests from specs (must be RED before implementation)',
    agent: 'specwork-test-writer',
    gate: 'human',
    model: 'opus',
    deps: ['snapshot'],
    inputs: ['.specwork/env/snapshot.md', ...specInputs],
    outputs: ['src/__tests__/'],
    scope: ['src/__tests__/'],
    validate: [
      { type: 'scope-check' },
      { type: 'tsc-check' },
      { type: 'tests-fail' },
    ],
    retry: 2,
  };
  nodes.push(writeTestsNode);

  // Impl nodes — collapse tasks per section into grouped nodes
  const validate: ValidationRule[] = [
    { type: 'scope-check' },
    { type: 'files-unchanged', args: { files: ['src/__tests__/', 'tests/', '__tests__/'] } },
    { type: 'imports-exist' },
    { type: 'tsc-check' },
    { type: 'tests-pass' },
  ];

  // Bucket tasks by groupIndex, separating opted-out tasks
  const groupMap = new Map<number, { name: string; grouped: ParsedTask[]; isolated: ParsedTask[] }>();
  for (const task of tasks) {
    if (!groupMap.has(task.groupIndex)) {
      groupMap.set(task.groupIndex, { name: task.group, grouped: [], isolated: [] });
    }
    const entry = groupMap.get(task.groupIndex)!;
    if (task.optOut) {
      entry.isolated.push(task);
    } else {
      entry.grouped.push(task);
    }
  }

  for (const [groupIndex, { name, grouped, isolated }] of groupMap) {
    // Emit collapsed or single group node
    if (grouped.length >= 2) {
      const scope = [...new Set(grouped.flatMap(t => extractFilePaths(t.rawLine)))];
      if (scope.length === 0) scope.push(`src/${slugify(name)}/`);
      const implNode: GraphNode = {
        id: `impl-${groupIndex}`,
        type: 'llm',
        description: name,
        agent: 'specwork-implementer',
        deps: ['write-tests'],
        inputs: ['.specwork/env/snapshot.md'],
        outputs: scope,
        scope,
        validate,
        retry: 2,
        group: slugify(name),
        sub_tasks: grouped.map(t => t.description),
      };
      nodes.push(implNode);
    } else if (grouped.length === 1) {
      const task = grouped[0];
      const scope = extractFilePaths(task.rawLine);
      const implScope = scope.length > 0 ? scope : [`src/${slugify(task.group)}/`];
      const implNode: GraphNode = {
        id: `impl-${groupIndex}`,
        type: 'llm',
        description: task.description,
        agent: 'specwork-implementer',
        deps: ['write-tests'],
        inputs: ['.specwork/env/snapshot.md'],
        outputs: implScope,
        scope: implScope,
        validate,
        retry: 2,
      };
      nodes.push(implNode);
    }

    // Emit opted-out (isolated) nodes
    for (const task of isolated) {
      const scope = extractFilePaths(task.rawLine);
      const implScope = scope.length > 0 ? scope : [`src/${slugify(task.group)}/`];
      const implNode: GraphNode = {
        id: `impl-${groupIndex}-${task.taskIndex}`,
        type: 'llm',
        description: task.description,
        agent: 'specwork-implementer',
        deps: ['write-tests'],
        inputs: ['.specwork/env/snapshot.md'],
        outputs: implScope,
        scope: implScope,
        validate,
        retry: 2,
      };
      nodes.push(implNode);
    }
  }

  // Last node: integration (deterministic)
  // Depends on all leaf impl nodes (nodes nothing else depends on)
  const depended = new Set<string>();
  for (const node of nodes) {
    for (const dep of node.deps) {
      depended.add(dep);
    }
  }
  const leafIds = nodes
    .filter(n => !depended.has(n.id) && n.id !== 'snapshot')
    .map(n => n.id);

  const integrationDeps = leafIds.length > 0 ? leafIds : ['write-tests'];

  const integrationNode: GraphNode = {
    id: 'integration',
    type: 'deterministic',
    description: 'Run full test suite (integration verification)',
    command: 'npm test',
    deps: integrationDeps,
    inputs: [],
    outputs: [],
    scope: [],
    validate: [{ type: 'tests-pass' }],
    retry: 1,
  };
  nodes.push(integrationNode);

  return {
    change,
    version: '1',
    created_at: now,
    nodes,
  };
}
