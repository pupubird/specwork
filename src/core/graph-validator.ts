import type { Graph, GraphNode } from '../types/graph.js';
import { detectCycles } from './graph-walker.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateGraph(graph: Graph): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for cycles
  const cycles = detectCycles(graph);
  for (const cycle of cycles) {
    errors.push(`Cycle detected: ${cycle.join(' → ')}`);
  }

  // Check for duplicate node IDs
  const ids = graph.nodes.map(n => n.id);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      errors.push(`Duplicate node ID: "${id}"`);
    }
    seen.add(id);
  }

  // Check all deps reference existing node IDs
  const idSet = new Set(ids);
  for (const node of graph.nodes) {
    for (const dep of node.deps) {
      if (!idSet.has(dep)) {
        errors.push(`Node "${node.id}" depends on unknown node "${dep}"`);
      }
    }
  }

  // Check orphan nodes (no deps and not depended on, except we allow first/last)
  const depended = new Set<string>();
  for (const node of graph.nodes) {
    for (const dep of node.deps) {
      depended.add(dep);
    }
  }
  const rootNodes = graph.nodes.filter(n => n.deps.length === 0);
  const leafNodes = graph.nodes.filter(n => !depended.has(n.id));

  for (const node of graph.nodes) {
    const isRoot = node.deps.length === 0;
    const isLeaf = !depended.has(node.id);
    if (isRoot && isLeaf && graph.nodes.length > 1) {
      warnings.push(`Node "${node.id}" is an orphan (no deps and nothing depends on it)`);
    }
  }

  // Suppress unused variable warnings — rootNodes/leafNodes used implicitly above
  void rootNodes;
  void leafNodes;

  // Check required fields per node type
  for (const node of graph.nodes) {
    checkRequiredFields(node, errors, warnings);
  }

  // Check scope overlap between LLM nodes (warning only)
  const llmNodes = graph.nodes.filter(n => n.type === 'llm');

  // Exact overlap: same path in multiple nodes
  const scopeOwners = new Map<string, string[]>();
  for (const node of llmNodes) {
    for (const s of node.scope) {
      const owners = scopeOwners.get(s) ?? [];
      owners.push(node.id);
      scopeOwners.set(s, owners);
    }
  }
  for (const [filePath, owners] of scopeOwners) {
    if (owners.length > 1) {
      warnings.push(`Scope overlap: "${filePath}" claimed by nodes: ${owners.join(', ')}`);
    }
  }

  // Prefix containment: one scope path is a prefix of another
  for (let i = 0; i < llmNodes.length; i++) {
    for (let j = i + 1; j < llmNodes.length; j++) {
      const nodeA = llmNodes[i];
      const nodeB = llmNodes[j];
      for (const sa of nodeA.scope) {
        for (const sb of nodeB.scope) {
          if (sa !== sb && (sb.startsWith(sa) || sa.startsWith(sb))) {
            warnings.push(`Scope containment: "${sa}" (${nodeA.id}) overlaps "${sb}" (${nodeB.id})`);
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function checkRequiredFields(node: GraphNode, errors: string[], warnings: string[]): void {
  switch (node.type) {
    case 'deterministic':
      if (!node.command) {
        errors.push(`Node "${node.id}" (deterministic) must have a "command" field`);
      }
      break;
    case 'llm':
      if (!node.agent) {
        errors.push(`Node "${node.id}" (llm) must have an "agent" field`);
      }
      if (!node.scope || node.scope.length === 0) {
        warnings.push(`Node "${node.id}" (llm) has empty scope — add file paths to tasks before running specwork go`);
      }
      break;
    case 'human':
      if (!node.description) {
        errors.push(`Node "${node.id}" (human) must have a "description" field`);
      }
      break;
  }
}
