export type NodeType = 'deterministic' | 'llm' | 'human';

export type ValidationRuleType =
  | 'tests-fail'
  | 'tests-pass'
  | 'tsc-check'
  | 'file-exists'
  | 'exit-code'
  | 'scope-check'
  | 'files-unchanged'
  | 'imports-exist';

export interface ValidationRule {
  type: ValidationRuleType;
  args?: Record<string, unknown>;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  description: string;
  agent?: string;
  deps: string[];
  inputs: string[];
  outputs: string[];
  scope: string[];
  validate: ValidationRule[];
  prompt?: string;
  command?: string;
  gate?: 'human';
  model?: string;
  retry?: number;
  worktree?: boolean;
}

export interface Graph {
  change: string;
  version: string;
  created_at: string;
  nodes: GraphNode[];
}
