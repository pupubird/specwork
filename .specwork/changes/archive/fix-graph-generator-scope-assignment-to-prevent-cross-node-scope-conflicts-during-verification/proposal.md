## Why

When `specwork go` runs multiple impl nodes in parallel (or sequentially within the same git working tree), scope-check verification breaks because it compares `git diff --name-only` against HEAD — which shows ALL uncommitted changes across every node that has run so far, not just the current node's changes. Node B's verification sees Node A's files as "outside scope" and incorrectly fails.

There are two independent root causes:

1. **Graph generator over-shares context**: scope is extracted from `task.rawLine + allContext.slice(0, 2000)` — the same shared blob for every node. When `extractFilePaths()` finds no explicit file paths it falls back to `src/`, which is too broad and causes false positives in scope enforcement.

2. **Scope-check uses wrong diff baseline**: `git diff --name-only` with no base SHA shows every uncommitted change in the working tree, not just the changes made since this particular node started executing.

## What Changes

### Modified Capabilities

- `verification`: The `scope-check` rule SHALL use a per-node git baseline SHA (recorded when the node transitions to `in_progress`) rather than comparing against the current HEAD. Only files modified after `node_start_sha` are evaluated against the node's scope.

- `graph-generator`: Scope extraction SHALL be limited to the individual task line only (not the full shared context blob). When no explicit file paths are found in the task line, fallback scope SHALL be the task's group directory heuristic (`src/<group-slug>/`) rather than the entire `src/` tree.

## Impact

- `src/core/graph-generator.ts` — change `extractFilePaths` call site and fallback logic
- `src/core/verification.ts` — change `runScopeCheck` to accept and use a `startSha` parameter
- `src/types/state.ts` — add `start_sha: string | null` field to `NodeState`
- `src/core/state-machine.ts` — record `start_sha` when node transitions to `in_progress`
