export interface L0Entry {
  nodeId: string;
  headline: string;
}

export interface L1Entry {
  nodeId: string;
  content: string;
}

export interface StructuredL1 {
  decisions: string[];
  contracts: string[];
  enables: string[];
  changed: string[];
}

export interface MicroSpecBundle {
  objective: string;
  specScenarios: string;
  parentDecisions: string[];
  outOfScope: string[];
  relevantFiles: string[];
  successCriteria: string[];
}

export interface ContextBundle {
  snapshot: string;
  l0: L0Entry[];
  l1: L1Entry[];
  inputs: Record<string, string>;
  prompt: string;
}
