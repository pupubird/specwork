## Context

Foreman CLI has 13 commands today. Developers interact with ~8 of them to run a single workflow. Most of these commands are "plumbing" — they exist for the engine skill (LLM agent) to call, not for humans to type.

The OpenSpec model is the inspiration: developers describe what they want, agents do the heavy lifting.

## Goals / Non-Goals

**Goals:**
- Developer remembers 3 commands: `plan`, `go`, `status`
- `foreman init` stays as a one-time setup (4th command, but one-time)
- All existing plumbing commands continue working (agents depend on them)
- CLI help clearly separates porcelain from plumbing

**Non-Goals:**
- Removing any existing commands (backward compatible)
- Building a full interactive TUI
- Changing the engine skill's internal workflow

## Decisions

### Decision: Porcelain commands output JSON for engine skill consumption
The `plan` and `go` commands don't run LLM logic themselves — they prepare structured payloads that the Claude Code engine skill consumes. This keeps the CLI deterministic (no LLM calls from CLI) and maintains the "CLI is stateless control plane" principle.

### Decision: Group commands in help output
Use commander's `addHelpText` to visually separate porcelain from plumbing in `--help` output. Plumbing commands show under a "Advanced / Agent Commands" section.

### Decision: `foreman plan` creates change dir + outputs agent prompt
It runs `foreman new` internally, then outputs a JSON payload with the description and file paths. The engine skill reads this and fills in proposal.md, tasks.md, generates graph, etc.

### Decision: `foreman go` wraps the run loop
It acquires the lock, calls `foreman run --json` internally, and outputs the execution plan. The engine skill reads this JSON and drives the node-by-node execution. `go` also handles `--from` and `--node` passthrough.

## Risks / Trade-offs

- [Risk] Developers might still use plumbing commands directly → Mitigation: clear docs, help text separation
- [Risk] `plan` creates empty templates that need LLM to fill → Mitigation: the slash command `/project:foreman-plan` triggers the engine skill which calls `foreman plan` and fills everything

## Open Questions

None — design is straightforward.
