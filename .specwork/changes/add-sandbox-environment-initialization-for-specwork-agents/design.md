# Design: Sandbox Environment Initialization for Specwork Agents

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────┐
│  CLI Layer: specwork sandbox <subcommand>        │
│  src/cli/sandbox.ts                              │
└──────────┬──────────────────────────┬────────────┘
           │                          │
    ┌──────▼──────┐           ┌───────▼──────┐
    │   Detect    │           │  Init / TD   │
    │ sandbox-    │           │ sandbox-     │
    │ detect.ts   │           │ init.ts /    │
    │             │           │ teardown.ts  │
    └──────┬──────┘           └───────┬──────┘
           │                          │
    ┌──────▼──────────────────────────▼──────┐
    │        Shared: sandbox-env.ts           │
    │  (.env.test generation, config loading) │
    └────────────────────────────────────────┘
           │
    ┌──────▼──────────────────────────────────┐
    │        Types: sandbox.ts                 │
    │  SandboxConfig, SandboxService, etc.    │
    └─────────────────────────────────────────┘
```

### Engine Integration

The sandbox lifecycle hooks into the existing engine state machine table (`.claude/skills/specwork-engine/SKILL.md`):

**Current flow:**
```
node:start → subagent:spawn → verify → complete
```

**New flow:**
```
node:start → sandbox init → subagent:spawn → verify → sandbox teardown → complete
```

This is CLI-driven (no pre-node hooks exist). The engine skill state machine table gets two new rows:
- After `node:start` result: run `specwork sandbox init <change> --json`
- After verify result: run `specwork sandbox teardown <change> --json`

### Config Resolution

```
.specwork/sandbox.yaml (base)          ← auto-detected or user-created
    ↓ merge
.specwork/changes/<name>/sandbox.yaml  ← per-change overrides (profile, skip, add)
    ↓ profile filter
Active profile services only           ← e.g., profiles.backend = [deps, docker, prisma, services]
    ↓ skip filter
Effective SandboxConfig                ← used by init
```

Per-change config supports:
- `extends: base` — merge with base config
- `profile: backend` — select which profile to activate
- `skip: [service-name]` — exclude specific services from the active profile
- `services: [...]` — add change-specific services (e.g., seed data)

## Data Model

### Mental Model: Docker Compose for Agents

Sandbox.yaml is to agent test environments what docker-compose.yaml is to container orchestration. It declares services, dependencies, health checks, and profiles — but for the full local dev stack (not just containers).

### SandboxConfig (sandbox.yaml schema)

```typescript
interface SandboxConfig {
  workspaces?: Record<string, string>;  // name → relative path (e.g., webapp: ./webapp)
  profiles?: Record<string, string[]>;  // profile name → service names to include
  default_profile?: string;             // which profile runs by default
  services: SandboxService[];
  detect: DetectConfig;
  ports: PortConfig;
  env: EnvConfig;
  teardown: TeardownConfig;
}

interface SandboxService {
  name: string;
  run?: string;                   // shell command (mutually exclusive with steps)
  steps?: SandboxStep[];          // ordered sub-commands (mutually exclusive with run)
  cwd?: string;                   // working directory (absolute or relative to root, or workspace name)
  background?: boolean;           // default: false
  when?: 'always' | 'if-missing' | 'never';  // default: 'always'
  check?: string;                 // path to check for 'if-missing'
  after?: string | string[];      // dependency on other service(s)
  ready_check?: ReadyCheck;
  ports?: number[];
  env?: Record<string, string>;   // per-service env vars
  outputs?: OutputCapture[];      // capture stdout patterns as env vars
  propagate_to?: string[];        // files to write captured outputs into
}

interface SandboxStep {
  run: string;                    // shell command
  cwd?: string;                   // override service-level cwd
  background?: boolean;
  after?: string;                 // dependency within steps (e.g., "solana.0")
  ready_check?: ReadyCheck;
  ports?: number[];
  env?: Record<string, string>;
  outputs?: OutputCapture[];
  propagate_to?: string[];
}

interface OutputCapture {
  var: string;                    // env var name to capture
  from: 'stdout' | 'stderr';
  pattern: string;                // regex with capture group
}

interface ReadyCheck {
  url?: string;                   // HTTP endpoint to poll
  command?: string;               // shell command (exit 0 = ready)
  timeout: number;                // seconds
  interval?: number;              // seconds, default: 2
}

interface DetectConfig {
  test_runner: 'auto' | 'vitest' | 'jest' | 'mocha' | 'pytest';
  e2e_framework: 'auto' | 'playwright' | 'cypress' | 'selenium';
  prompt_if_missing: boolean;
}

interface EnvConfig {
  template: string;               // e.g., '.env.example'
  output: string;                 // e.g., '.env.test'
  defaults: Record<string, string>;
}
```

### Per-Change Override (SandboxChangeConfig)

```typescript
interface SandboxChangeConfig {
  extends: 'base';
  profile?: string;               // which profile to use for this change
  skip?: string[];                // services to exclude
  services?: SandboxService[];    // additional services for this change
}
```

Written to `.specwork/changes/<name>/sandbox.yaml`. Planner generates this during `specwork plan`.

### SandboxState (runtime PID tracking)

```typescript
interface SandboxState {
  change: string;
  profile: string;
  started_at: string;
  services: ServiceState[];
  captured_outputs: Record<string, string>;  // accumulated output captures
}

interface ServiceState {
  name: string;
  pid?: number;
  port?: number;
  status: 'running' | 'stopped' | 'failed';
  reused?: boolean;               // true if port was already in use and user chose reuse
}
```

Written to `.specwork/sandbox/state.json` — ephemeral, not committed.

### DetectionResult

```typescript
interface DetectionResult {
  project_type: 'node' | 'python' | 'unknown';
  package_manager: 'npm' | 'yarn' | 'pnpm' | 'pip' | null;
  test_runner: string | null;
  e2e_framework: string | null;
  has_docker: boolean;
  docker_services: string[];
  has_dev_script: boolean;        // detected dev.sh, Makefile, etc.
  workspaces: Record<string, string>;  // detected sub-projects
  has_env_example: boolean;
  env_vars: string[];
  scripts: Record<string, string>;
  detected_services: SandboxService[];
}
```

## Implementation Plan

### Phase 1: Types & Detection
1. Define all TypeScript types in `src/types/sandbox.ts`
2. Build detection engine in `src/core/sandbox-detect.ts`:
   - Read package.json for deps, scripts, test runner
   - Read docker-compose.yaml for services
   - Read .env.example for env vars
   - Runtime probing (docker compose config, pg_isready, etc.)
   - Generate default sandbox.yaml from detection results

### Phase 2: Config & Env
3. Build config loader with base + per-change merge in `src/core/sandbox-init.ts`
4. Build .env.test generator in `src/core/sandbox-env.ts`

### Phase 3: Lifecycle
5. Build init logic in `src/core/sandbox-init.ts`:
   - Load and merge config
   - Check port conflicts (detect & warn)
   - Run services in dependency order (respecting `after`)
   - Poll ready checks
   - Write PID state file
6. Build teardown in `src/core/sandbox-teardown.ts`:
   - Read state file
   - Kill tracked PIDs only
   - Run teardown commands
   - Clean temp paths
   - Remove state file

### Phase 4: CLI & Integration
7. Build CLI commands in `src/cli/sandbox.ts` (Commander pattern)
8. Register in `src/index.ts`
9. Update engine state machine table in SKILL.md

## Risks

| Risk | Mitigation |
|------|------------|
| Port conflicts with user processes | Detect & warn, never kill — user chooses action |
| Ready check timeout | Configurable timeout + clear error message |
| PID tracking on macOS vs Linux | Use `process.kill(pid, 0)` for cross-platform PID check |
| Detection false positives | Detection results are written to config for user review before use |
| Background process zombies | Teardown is always called, even on node failure |
