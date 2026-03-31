## 1. Types

- [x] 1.1 Define sandbox type definitions: SandboxConfig (with workspaces, profiles, default_profile), SandboxService (with cwd, steps, env, outputs, propagate_to), SandboxStep, OutputCapture, ReadyCheck, DetectConfig, PortConfig, EnvConfig, TeardownConfig, SandboxState (with profile, captured_outputs), ServiceState (with reused), DetectionResult (with workspaces, has_dev_script), SandboxChangeConfig (with profile)
  scope: src/types/sandbox.ts

## 2. Detection Engine

- [x] 2.1 Implement project detection: read package.json (deps, scripts, test runner, e2e framework), docker-compose.yaml (services, ports), .env.example (vars), framework configs; detect workspaces (sub-dirs with own package.json/Cargo.toml/go.mod); detect existing dev scripts (dev.sh, Makefile, Taskfile.yml); runtime probing (docker compose config, pg_isready); generate DetectionResult with auto-detected SandboxService list including cwd per workspace
  scope: src/core/sandbox-detect.ts

## 3. Environment Generation

- [x] 3.1 Implement .env.test generation: read .env.example template, merge with env.defaults from sandbox config, write .env.test with test-safe values; skip if no template exists; support output propagation (write captured outputs from sandbox state into target files via propagate_to)
  scope: src/core/sandbox-env.ts

## 4. Sandbox Init

- [x] 4.1 Implement sandbox init: load base sandbox.yaml, merge per-change overrides (extends/profile/skip/services), filter services by active profile, resolve service dependency order via `after` field (including multi-step `after` within steps), resolve cwd against workspaces config, check port conflicts (detect listening ports, warn user with reuse/alternate/abort options), run foreground services/steps first then background services, poll ready_checks with configurable timeout/interval, capture outputs from stdout via regex patterns, propagate captured outputs to target files, write PID state with captured_outputs to `.specwork/sandbox/state.json`, support --dry-run mode
  scope: src/core/sandbox-init.ts

## 5. Sandbox Teardown

- [x] 5.1 Implement sandbox teardown: read `.specwork/sandbox/state.json`, kill only tracked PIDs (never user processes, skip reused services), run configured teardown commands, clean temp paths from cleanup_paths config, remove state file on completion
  scope: src/core/sandbox-teardown.ts

## 6. CLI Commands

- [x] 6.1 Implement `specwork sandbox` CLI with subcommands: `init [change] [--dry-run] [--profile <name>]` (detect + setup), `teardown [change]` (cleanup), `status` (show running services from state.json), `detect` (run detection only, output results); follow Commander pattern (makeSandboxCommand), register in src/index.ts; all subcommands support --json output mode
  scope: src/cli/sandbox.ts, src/index.ts

## 7. Engine Integration

- [x] 7.1 Update engine state machine table in SKILL.md: add `sandbox:init` row after `node:start` result (runs `specwork sandbox init <change> --json` before `subagent:spawn`), add `sandbox:teardown` row after verify result (runs `specwork sandbox teardown <change> --json` before `node:complete`)
  scope: .claude/skills/specwork-engine/SKILL.md
