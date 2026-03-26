export interface SpecworkConfig {
  models: {
    default: string;
    test_writer: string;
    summarizer: string;
    verifier: string;
  };
  execution: {
    max_retries: number;
    expand_limit: number;
    parallel_mode: 'sequential' | 'parallel';
    snapshot_refresh: 'after_each_node' | 'once' | 'never';
  };
  context: {
    ancestors: 'L0';
    parents: 'L1';
  };
  spec: {
    schema: string;
    specs_dir: string;
    changes_dir: string;
    templates_dir: string;
  };
  graph: {
    graphs_dir: string;
    nodes_dir: string;
  };
  env: {
    env_dir: string;
    active: string;
  };
}
