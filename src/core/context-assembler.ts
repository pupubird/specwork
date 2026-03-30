import path from 'node:path';
import fs from 'node:fs';
import { minimatch } from 'minimatch';
import { readYaml, readMarkdown } from '../io/filesystem.js';
import { graphPath, statePath, nodeDir, snapshotPath } from '../utils/paths.js';
import { getParents } from './graph-walker.js';
import { debug } from '../utils/logger.js';
import type { Graph, ValidationRule } from '../types/graph.js';
import type { WorkflowState } from '../types/state.js';
import type { ContextBundle, L0Entry, L1Entry, StructuredL1 } from '../types/context.js';

export function getL0All(root: string, change: string): L0Entry[] {
  const nodesBase = path.join(root, '.specwork', 'nodes', change);
  if (!fs.existsSync(nodesBase)) return [];

  const entries: L0Entry[] = [];
  const nodeDirs = fs.readdirSync(nodesBase, { withFileTypes: true });

  for (const dirent of nodeDirs) {
    if (!dirent.isDirectory()) continue;
    const l0Path = path.join(nodesBase, dirent.name, 'L0.md');
    if (!fs.existsSync(l0Path)) continue;
    const headline = fs.readFileSync(l0Path, 'utf8').trim();
    if (headline) {
      entries.push({ nodeId: dirent.name, headline });
    }
  }

  return entries;
}

export function getL1(root: string, change: string, nodeId: string): string {
  const l1Path = path.join(nodeDir(root, change, nodeId), 'L1.md');
  return readMarkdown(l1Path);
}

export function getStructuredL1(root: string, change: string, nodeId: string): StructuredL1 | null {
  const filePath = path.join(nodeDir(root, change, nodeId), 'L1-structured.json');
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as StructuredL1;
}

export function getL2(root: string, change: string, nodeId: string): string {
  const l2Path = path.join(nodeDir(root, change, nodeId), 'L2.md');
  return readMarkdown(l2Path);
}

export function sliceSpecs(root: string, change: string, refs: string[]): string {
  const specsDir = path.join(root, '.specwork', 'changes', change, 'specs');
  const parts: string[] = [];

  for (const ref of refs) {
    const hashIdx = ref.indexOf('#');
    const file = hashIdx >= 0 ? ref.slice(0, hashIdx) : ref;
    const anchor = hashIdx >= 0 ? ref.slice(hashIdx + 1) : null;

    const filePath = path.join(specsDir, file);
    if (!fs.existsSync(filePath)) {
      parts.push(`<!-- WARNING: spec file not found: ${file} -->`);
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');

    if (!anchor) {
      parts.push(content);
      continue;
    }

    const lines = content.split('\n');
    let startIdx = -1;
    let headingLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const reqMatch = lines[i].match(/^(#{3})\s+Requirement:\s+(.+)$/);
      const scenMatch = lines[i].match(/^(#{4})\s+Scenario:\s+(.+)$/);
      const match = reqMatch || scenMatch;
      if (match && match[2].trim() === anchor) {
        startIdx = i;
        headingLevel = match[1].length;
        break;
      }
    }

    if (startIdx < 0) {
      parts.push(`<!-- WARNING: scenario not found: ${anchor} in ${file} -->`);
      continue;
    }

    const section: string[] = [lines[startIdx]];
    for (let i = startIdx + 1; i < lines.length; i++) {
      const headingMatch = lines[i].match(/^(#{1,6})\s/);
      if (headingMatch && headingMatch[1].length <= headingLevel) {
        break;
      }
      section.push(lines[i]);
    }

    parts.push(section.join('\n'));
  }

  return parts.join('\n\n');
}

export function assembleContext(
  root: string,
  change: string,
  nodeId: string
): ContextBundle {
  // Load graph and state to determine completed nodes and parents
  const graph = readYaml<Graph>(graphPath(root, change));
  const state = readYaml<WorkflowState>(statePath(root, change));

  // L0 for all completed nodes
  const allL0 = getL0All(root, change);
  const completedIds = new Set(
    Object.entries(state.nodes)
      .filter(([, ns]) => ns.status === 'complete')
      .map(([id]) => id)
  );
  const l0 = allL0.filter(e => completedIds.has(e.nodeId));

  // L1 for direct parents only
  let parentIds: string[] = [];
  try {
    parentIds = getParents(graph, nodeId);
  } catch {
    debug(`Could not get parents for node ${nodeId} — node may not exist in graph`);
  }

  const l1: L1Entry[] = [];
  for (const parentId of parentIds) {
    const content = getL1(root, change, parentId);
    if (content) {
      l1.push({ nodeId: parentId, content });
    }
  }

  // Snapshot
  const snapshot = readMarkdown(snapshotPath(root));

  // Node inputs (files listed in graph node's inputs array)
  const graphNode = graph.nodes.find(n => n.id === nodeId);
  const inputs: Record<string, string> = {};
  if (graphNode?.inputs) {
    for (const inputPath of graphNode.inputs) {
      const absPath = path.resolve(root, inputPath);
      if (fs.existsSync(absPath)) {
        inputs[inputPath] = fs.readFileSync(absPath, 'utf8');
      }
    }
  }

  // Node prompt
  const prompt = graphNode?.prompt ?? '';

  return { snapshot, l0, l1, inputs, prompt };
}

export function renderContext(bundle: ContextBundle): string {
  const sections: string[] = [];

  if (bundle.snapshot) {
    sections.push('## Environment Snapshot\n\n' + bundle.snapshot);
  }

  if (bundle.l0.length > 0) {
    const headlines = bundle.l0.map(e => `- **${e.nodeId}**: ${e.headline}`).join('\n');
    sections.push('## Completed Nodes (L0)\n\n' + headlines);
  }

  if (bundle.l1.length > 0) {
    const l1Sections = bundle.l1
      .map(e => `### ${e.nodeId}\n\n${e.content}`)
      .join('\n\n');
    sections.push('## Parent Node Context (L1)\n\n' + l1Sections);
  }

  if (Object.keys(bundle.inputs).length > 0) {
    const inputSections = Object.entries(bundle.inputs)
      .map(([p, content]) => `### ${p}\n\n\`\`\`\n${content}\n\`\`\``)
      .join('\n\n');
    sections.push('## Input Files\n\n' + inputSections);
  }

  if (bundle.prompt) {
    sections.push('## Node Prompt\n\n' + bundle.prompt);
  }

  return sections.join('\n\n---\n\n');
}

export function filterSnapshot(snapshot: string, scope: string[]): string {
  if (scope.length === 0) return snapshot;

  const lines = snapshot.split('\n');
  const result: string[] = [];
  let inFileTree = false;
  let treeLines: string[] = [];
  let treeSectionHeaderIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## File Tree')) {
      inFileTree = true;
      treeSectionHeaderIdx = result.length;
      result.push(line); // placeholder, may be removed
      continue;
    }
    if (inFileTree && line.startsWith('## ')) {
      inFileTree = false;
      // Emit filtered tree lines before this section
      const matched = treeLines.filter(l => l === '' || scope.some(g => minimatch(l, g)));
      const nonEmpty = matched.filter(l => l !== '');
      if (nonEmpty.length === 0) {
        // Remove the ## File Tree header we added and skip tree lines
        result.splice(treeSectionHeaderIdx, 1);
      } else {
        for (const tl of matched) result.push(tl);
      }
      treeLines = [];
      result.push(line);
      continue;
    }
    if (inFileTree) {
      treeLines.push(line);
    } else {
      result.push(line);
    }
  }

  // Handle tree section at end of file
  if (inFileTree && treeLines.length > 0) {
    const matched = treeLines.filter(l => l === '' || scope.some(g => minimatch(l, g)));
    const nonEmpty = matched.filter(l => l !== '');
    if (nonEmpty.length === 0) {
      result.splice(treeSectionHeaderIdx, 1);
    } else {
      for (const tl of matched) result.push(tl);
    }
  }

  return result.join('\n');
}

export function expandValidate(rules: ValidationRule[]): string[] {
  return rules.map(rule => {
    switch (rule.type) {
      case 'tests-pass':
        return `All tests pass${rule.args?.pattern ? ` matching ${rule.args.pattern}` : ''}`;
      case 'tsc-check':
        return 'TypeScript type-check passes (tsc --noEmit)';
      case 'file-exists':
        return `File exists: ${rule.args?.path ?? '(unknown)'}`;
      case 'scope-check':
        return 'Only files within the allowed scope are modified';
      case 'files-unchanged':
        return `Files are unchanged/immutable: ${((rule.args?.paths as string[]) ?? []).join(', ')}`;
      case 'imports-exist':
        return 'All imports resolve correctly';
      default:
        return `Validation: ${rule.type}`;
    }
  });
}

export function getParentL1Sources(graph: Graph, nodeId: string): Array<{ nodeId: string }> {
  const node = graph.nodes.find(n => n.id === nodeId);
  if (!node) return [];
  return node.deps.map(depId => ({ nodeId: depId }));
}

export function composeMicroSpec(root: string, change: string, nodeId: string): string {
  const graph = readYaml<Graph>(graphPath(root, change));
  const graphNode = graph.nodes.find(n => n.id === nodeId);
  if (!graphNode) return `# Node: ${nodeId}\n\n(node not found in graph)`;

  const sections: string[] = [];
  sections.push(`# Node: ${nodeId}\n\n${graphNode.description}`);

  // Scope
  if (graphNode.scope && graphNode.scope.length > 0) {
    sections.push(`## Scope\n\n${graphNode.scope.map(s => `- ${s}`).join('\n')}`);
  }

  // Specs
  const nodeSpecs = (graphNode as unknown as { specs?: string[] }).specs;
  if (nodeSpecs && nodeSpecs.length > 0) {
    const specContent = sliceSpecs(root, change, nodeSpecs);
    if (specContent) sections.push(`## Specs\n\n${specContent}`);
  }

  // Snapshot (filtered by scope)
  const rawSnapshot = readMarkdown(snapshotPath(root));
  if (rawSnapshot) {
    const filtered = filterSnapshot(rawSnapshot, graphNode.scope ?? []);
    if (filtered) sections.push(`## Environment Snapshot\n\n${filtered}`);
  }

  // L0 for all completed nodes
  const state = readYaml<import('../types/state.js').WorkflowState>(statePath(root, change));
  const completedIds = new Set(
    Object.entries(state.nodes)
      .filter(([, ns]) => ns.status === 'complete')
      .map(([id]) => id)
  );
  const allL0 = getL0All(root, change).filter(e => completedIds.has(e.nodeId));
  if (allL0.length > 0) {
    const headlines = allL0.map(e => `- **${e.nodeId}**: ${e.headline}`).join('\n');
    sections.push(`## Completed Nodes (L0)\n\n${headlines}`);
  }

  // Structured L1 for parents
  let parentIds: string[] = [];
  try { parentIds = getParents(graph, nodeId); } catch { /* no parents */ }

  for (const parentId of parentIds) {
    const structured = getStructuredL1(root, change, parentId);
    if (structured) {
      const parts: string[] = [];
      if (structured.decisions.length > 0) parts.push(`**Decisions:** ${structured.decisions.join('; ')}`);
      if (structured.contracts.length > 0) parts.push(`**Contracts:** ${structured.contracts.join('; ')}`);
      if (structured.changed.length > 0) parts.push(`**Changed:** ${structured.changed.join(', ')}`);
      if (parts.length > 0) sections.push(`## Parent Context: ${parentId}\n\n${parts.join('\n')}`);
    } else {
      const l1 = getL1(root, change, parentId);
      if (l1) sections.push(`## Parent Context: ${parentId}\n\n${l1}`);
    }
  }

  // Validation rules
  if (graphNode.validate && graphNode.validate.length > 0) {
    const checks = expandValidate(graphNode.validate).map(r => `- ${r}`).join('\n');
    sections.push(`## Validation Checks\n\n${checks}`);
  }

  // Prompt
  if (graphNode.prompt) {
    sections.push(`## Prompt\n\n${graphNode.prompt}`);
  }

  return sections.join('\n\n---\n\n');
}
