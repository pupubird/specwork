## Why

Foreman currently exposes 13 CLI commands, and a developer must remember ~8 of them plus manually edit 4 template files to run a workflow. This is too much cognitive load. The CLI was designed as a control plane for agents, but human-facing commands should be minimal.

The goal: **3 porcelain commands a developer needs to remember** (plus `init` for one-time setup).

## What Changes

Restructure the CLI into two tiers:
- **Porcelain** (human-facing): `foreman init`, `foreman plan`, `foreman go`, `foreman status`
- **Plumbing** (agent-facing): everything else (`node`, `context`, `scope`, `graph`, `snapshot`, `run`, etc.)

### `foreman plan "<description>"`
- Takes a natural language description of what the developer wants to build
- Outputs a structured JSON prompt that tells the Claude Code engine skill what to do
- The engine skill (LLM) handles: creating proposal.md, specs, design, tasks, graph generation
- Shows the plan for human approval before proceeding

### `foreman go <change>`
- Replaces the manual `foreman run` → `foreman node start/complete` loop
- Outputs the execution payload for the engine skill to consume autonomously
- Pauses at human gates for approval

### `foreman status` (enhanced)
- Shows ALL active changes with progress when no change specified
- Shows detailed node table when a change is specified (existing behavior)

## Capabilities

### New Capabilities
- `plan-command`: Planning command that bootstraps a complete change from description
- `go-command`: Autonomous execution command that drives a full workflow

### Modified Capabilities
- `status-command`: Enhanced to show all active changes by default
- `cli-structure`: Reorganized into porcelain (human) / plumbing (agent) tiers

## Impact

- `src/cli/plan.ts` — new file
- `src/cli/go.ts` — new file
- `src/cli/status.ts` — enhanced multi-change view
- `src/index.ts` — reorganized command registration with porcelain/plumbing grouping
- `README.md` — simplified quick start around 3 commands
