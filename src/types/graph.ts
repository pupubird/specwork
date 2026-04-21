export type NodeType = 'deterministic' | 'llm' | 'human';

export interface GraphNode {
  id: string;
  type: NodeType;
  description: string;
  agent?: string;
  deps: string[];
  inputs: string[];
  outputs: string[];
  scope: string[];
  prompt?: string;
  specs?: string[];
  command?: string;
  gate?: 'human';
  model?: string;
  retry?: number;
  worktree?: boolean;
  group?: string | null;
  sub_tasks?: string[];
}

export interface Graph {
  change: string;
  version: string;
  created_at: string;
  nodes: GraphNode[];
}
