import path from 'node:path';
import fs from 'node:fs';
import { readYaml, readMarkdown } from '../io/filesystem.js';
import { graphPath, statePath, nodeDir, snapshotPath } from '../utils/paths.js';
import { getParents } from './graph-walker.js';
import { debug } from '../utils/logger.js';
import type { Graph } from '../types/graph.js';
import type { WorkflowState } from '../types/state.js';
import type { ContextBundle, L0Entry, L1Entry } from '../types/context.js';

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

export function getL2(root: string, change: string, nodeId: string): string {
  const l2Path = path.join(nodeDir(root, change, nodeId), 'L2.md');
  return readMarkdown(l2Path);
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
