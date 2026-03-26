export type NodeStatus =
  | 'pending'
  | 'in_progress'
  | 'complete'
  | 'failed'
  | 'escalated'
  | 'rejected'
  | 'skipped';

export type ChangeStatus = 'active' | 'complete' | 'failed' | 'paused';

export interface NodeState {
  status: NodeStatus;
  started_at: string | null;
  completed_at: string | null;
  retries: number;
  error: string | null;
  l0: string | null;
}

export interface LockInfo {
  pid: number;
  acquired_at: string;
}

export interface WorkflowState {
  change: string;
  status: ChangeStatus;
  started_at: string;
  updated_at: string;
  lock: LockInfo | null;
  nodes: Record<string, NodeState>;
}

export interface NextAction {
  command: string;
  description: string;
  context: string;
  on_pass?: string;
  on_fail?: string;
  suggest_to_user?: string[];
}
