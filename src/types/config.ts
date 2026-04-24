export interface SpecworkConfig {
  specwork_version?: string;
  models: {
    default: string;
    test_writer: string;
  };
  execution: {
    max_retries: number;
    expand_limit: number;
    parallel_mode: 'sequential' | 'parallel';
    max_concurrent?: number;
  };
  context: {
    ancestors: 'L0';
    parents: 'L1';
  };
  spec: {
    schema: string;
    specs_dir: string;
    changes_dir: string;
    archive_dir?: string;
    templates_dir: string;
  };
  graph: {
    graphs_dir: string;
    nodes_dir: string;
  };
  environments?: {
    env_dir: string;
    active: string;
  };
  env?: {
    env_dir: string;
    active: string;
  };
}
