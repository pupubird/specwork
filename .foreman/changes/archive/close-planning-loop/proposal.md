## Why

Two gaps exist in the current Foreman planning loop that waste context and undermine the team-based execution model:

**Gap 1: The planner rediscovers context it already has.**
Every time `foreman-plan` spawns the `foreman-planner` agent for its research phase, the planner starts from scratch — reading `.foreman/specs/`, walking the file tree, examining package.json. This burns significant context tokens on work that can be done once, cheaply, before the agent is even spawned. The result is a bloated, slow research phase with no improvement in quality.

**Gap 2: The foreman loop uses raw Agent calls instead of TeamCreate.**
`foreman-go` and `foreman-engine` were built when the codebase used subagents (bare `Agent` tool calls). The CLAUDE.md global instructions establish Agent Teams as the primary multi-agent strategy. The foreman execution loop was never updated to match. This means Foreman workflows run outside the team coordination model: no `TaskCreate`/`TaskUpdate` tracking, no `TeamDelete` cleanup, no shared task visibility. Even single-node sequential workflows should go through TeamCreate so that execution is always observable, structured, and consistent.

## What Changes

### New Capabilities
- `planning-context`: The `foreman-plan` slash command pre-assembles a compact codebase context block (spec headers + file listing + snapshot) before spawning the planner agent. The planner receives this as input and skips redundant reads.

### Modified Capabilities
- `team-enforcement`: All foreman execution (planning spawn, node execution) uses TeamCreate. The `foreman-go` slash command creates a team per workflow run. The `foreman-engine` skill enforces TeamCreate unconditionally — not conditionally on `parallel_mode`.
- `parallel-default`: `config.execution.parallel_mode` defaults to `parallel` instead of `sequential`.

## Impact

- `foreman-plan` slash command gains a pre-assembly step (spec headers + snapshot read) before spawning planner
- `foreman-planner` agent updated to accept pre-assembled context and skip the redundant specs folder walk
- `foreman-go` slash command rewritten to use TeamCreate for node execution
- `foreman-engine` SKILL.md updated to remove conditional team usage — teams are mandatory
- `.foreman/config.yaml` parallel_mode default changed from `sequential` to `parallel`
