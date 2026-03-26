## Why

Completed changes sit in `.foreman/changes/` forever — there's no archive step. The engine skill describes a QA agent in the verify-retry loop, but nothing orchestrates it. Agent team usage isn't documented in foreman instructions.

## What Changes

1. **Auto-archive completed changes** — when `foreman go` detects all nodes terminal and change status is `complete`, move change artifacts + graph + nodes to `.foreman/changes/archive/<name>/`
2. **QA orchestration in verify loop** — add `needs_qa()` logic, update engine skill with concrete QA spawning instructions, ensure `foreman-qa` agent results feed back into retry loop
3. **Document agent team usage** — update CLAUDE.md and engine skill with agent team patterns for parallel node execution

## Capabilities

### New Capabilities
- `archive`: Auto-archive completed changes to `.foreman/changes/archive/` with full artifacts (graph, state, nodes, L0/L1/L2)
- `qa-orchestration`: Engine skill drives QA agent spawning based on `config.execution.verify` mode

### Modified Capabilities
- `go`: Triggers archive on completion
- `engine-skill`: Updated verify-retry loop with QA orchestration and agent team instructions

## Impact

- Keeps `.foreman/changes/` clean — only active work visible
- QA loop catches bugs before marking nodes complete
- Agent teams documented so future workflows can use parallel execution
