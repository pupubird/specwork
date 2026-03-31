export interface SandboxConfig {
  workspaces?: Record<string, string>;
  profiles?: Record<string, string[]>;
  default_profile?: string;
  services: SandboxService[];
  detect: DetectConfig;
  ports: PortConfig;
  env: EnvConfig;
  teardown: TeardownConfig;
}

export interface SandboxService {
  name: string;
  run?: string;
  steps?: SandboxStep[];
  cwd?: string;
  background?: boolean;
  when?: 'always' | 'if-missing' | 'never';
  check?: string;
  after?: string | string[];
  ready_check?: ReadyCheck;
  ports?: number[];
  env?: Record<string, string>;
  outputs?: OutputCapture[];
  propagate_to?: string[];
}

export interface SandboxStep {
  run: string;
  cwd?: string;
  background?: boolean;
  after?: string;
  ready_check?: ReadyCheck;
  ports?: number[];
  env?: Record<string, string>;
  outputs?: OutputCapture[];
  propagate_to?: string[];
}

export interface OutputCapture {
  var: string;
  from: 'stdout' | 'stderr';
  pattern: string;
}

export interface ReadyCheck {
  url?: string;
  command?: string;
  timeout: number;
  interval?: number;
}

export interface DetectConfig {
  test_runner: 'auto' | 'vitest' | 'jest' | 'mocha' | 'pytest';
  e2e_framework: 'auto' | 'playwright' | 'cypress' | 'selenium';
  prompt_if_missing: boolean;
}

export interface PortConfig {
  conflict_strategy: 'warn' | 'reuse' | 'alternate';
  range_start?: number;
}

export interface EnvConfig {
  template: string;
  output: string;
  defaults: Record<string, string>;
}

export interface TeardownConfig {
  commands?: string[];
  cleanup_paths?: string[];
}

export interface SandboxState {
  change: string;
  profile: string;
  started_at: string;
  services: ServiceState[];
  captured_outputs: Record<string, string>;
}

export interface ServiceState {
  name: string;
  pid?: number;
  port?: number;
  status: 'running' | 'stopped' | 'failed';
  reused?: boolean;
}

export interface DetectionResult {
  project_type: 'node' | 'python' | 'unknown';
  package_manager: 'npm' | 'yarn' | 'pnpm' | 'pip' | null;
  test_runner: string | null;
  e2e_framework: string | null;
  e2e_missing?: boolean;
  has_docker: boolean;
  docker_services: string[];
  has_dev_script: boolean;
  workspaces: Record<string, string>;
  has_env_example: boolean;
  env_vars: string[];
  scripts: Record<string, string>;
  detected_services: SandboxService[];
}

export interface SandboxChangeConfig {
  extends: 'base';
  profile?: string;
  skip?: string[];
  services?: SandboxService[];
}
