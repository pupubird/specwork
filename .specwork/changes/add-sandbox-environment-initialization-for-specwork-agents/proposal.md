# Proposal: Sandbox Environment Initialization for Specwork Agents

## Problem

Specwork agents (test-writers, implementers, verifiers) run tests and e2e checks but have no guarantee that the required local environment is available. Dev servers, databases, test frameworks, and dependencies may not be running or installed. This causes:

- **Silent test failures** — agents write correct tests that fail because the database isn't up or deps aren't installed
- **Wasted retries** — the engine retries nodes that can never pass without infrastructure
- **Manual babysitting** — users must remember to start services before `specwork go`
- **No reproducibility** — different runs behave differently depending on what happens to be running

## Solution

A sandbox lifecycle system integrated into the engine state machine that:

1. **Detects** project infrastructure from package.json, docker-compose, .env, and framework configs
2. **Initializes** services (install deps, start dev servers, spin up databases) before subagents run
3. **Tears down** background processes cleanly after verification completes
4. **Tracks state** via PID files so only sandbox-started processes are killed

The system is config-driven via `.specwork/sandbox.yaml` (base) and per-change overrides, with auto-detection for projects without existing config.

## Scope

### In Scope
- Detection engine: deps, scripts, configs, Docker, .env, runtime probing
- Service lifecycle: init (with ready checks), teardown (PID-tracked)
- Port conflict detection and user-prompted resolution
- `.env.test` generation from `.env.example` with test-safe defaults
- CLI commands: `sandbox init`, `sandbox teardown`, `sandbox status`, `sandbox detect`
- Engine integration: state machine table additions for sandbox init/teardown
- Per-change sandbox overrides (skip services, add services)

### Out of Scope
- Cloud/remote environment provisioning
- CI-specific sandbox profiles (future work)
- Persistent sandbox state across workflow runs (ephemeral by design)
- Kubernetes or container orchestration beyond docker-compose

## Success Criteria

- `specwork sandbox init` detects and starts all required services for a project
- `specwork sandbox teardown` cleanly stops only sandbox-started processes
- Engine state machine triggers sandbox init before subagent spawn and teardown after verify
- Port conflicts are detected and surfaced to the user (never silently kill existing processes)
- `--dry-run` shows what would happen without executing
- Tests exist and pass for all sandbox modules
