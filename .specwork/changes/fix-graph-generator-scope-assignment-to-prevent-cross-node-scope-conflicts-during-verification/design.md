## Context

When `specwork go` executes multiple impl nodes in the same git working tree, scope-check verification fails on later nodes because `git diff --name-only` (no baseline) returns ALL uncommitted changes — including files modified by previously-executed sibling nodes. A node declared with `scope: ["src/core/bar.ts"]` fails because it sees `src/core/foo.ts` (modified by node A) as "outside scope."

A secondary problem is that the graph generator extracts scope from a shared 2000-char context blob for every node, so all nodes get identical (or near-identical) scopes. When no explicit paths are found, the fallback is `src/` — the entire source tree — which defeats scope enforcement entirely.

---

## Goals / Non-Goals

**Goals:**
- Scope-check compares only files modified since the node started
- Each impl node gets a distinct scope derived from its own task line
- No regressions to existing verification behavior

**Non-Goals:**
- Changing how scopes are communicated to agents (scope is still used for `scope-guard.sh`)
- Fixing scope assignment for `write-tests` node (it uses a fixed hardcoded scope, which is correct)
- Supporting workspaces or monorepos (out of scope for this change)

---

## Decisions

### Decision: Scope extraction from task line only (not shared context)

**Current**: `extractFilePaths(task.rawLine + '\n' + allContext.slice(0, 2000))` — every node scans the same shared blob.

**New**: `extractFilePaths(task.rawLine)` — per-task only.

Why: The shared-context approach was intended to help when a task line has no explicit paths. But it causes all nodes to inherit every file mentioned anywhere in the proposal/design/tasks, making scopes overlapping and useless for enforcement.

**Fallback change**: When no paths found, use `src/<slugify(task.group)>/` instead of `src/`. This narrows the fallback to the group's logical directory while still allowing the implementer to work.

`slugify` already exists in the file — zero new utilities.

### Decision: Pass start_sha through transitionNode opts (not via root I/O)

Two options:
- **A**: `transitionNode` accepts `root?: string` and resolves the SHA internally.
- **B**: Caller resolves the SHA and passes it via `opts.start_sha`.

**Decision**: Option B. `transitionNode` is a pure state transformer — keeping I/O out of it maintains testability and consistency with how `l0` is already passed. Callers (graph-walker, CLI) already know the root path and can resolve the SHA before calling.

`start_sha` is only set on the first `in_progress` transition — retries do not overwrite it. This ensures the baseline always points to before the node first started, capturing all of the node's changes across retries.

### Decision: RunChecksOptions gains startSha field

`startSha` flows from `NodeState.start_sha` → `RunChecksOptions` → `runSingleCheck` context → `runScopeCheck`. This is additive (no existing call sites need to change — `startSha` defaults to `undefined`, which triggers the existing fallback behavior).

---

## Risks / Trade-offs

- [Risk: group-slug fallback may not match real directory structure] → Mitigation: fallback is only used when the task line has no explicit paths. If the directory doesn't exist at verification time, scope-check still passes (no files would be diff'd against a non-existent path). The agent's output files will be caught by other checks (tsc-check, tests-pass).

- [Risk: start_sha points to a commit that predates the file being created] → This is intentional and correct — `git diff <sha>` shows all changes since sha, including new files. `--name-only` handles untracked-but-staged files too. Truly untracked (unstaged) files will not appear in git diff but also won't trigger scope violations.

- [Risk: existing state.yaml files missing start_sha] → `defaultNodeState()` will set `start_sha: null`, and JSON deserialization of old files simply omits the field (treated as `null`). The fallback in `runScopeCheck` handles `null` gracefully.

---

## Migration Plan

1. Add `start_sha: string | null` to `NodeState` with default `null` — backward compatible.
2. Update `transitionNode` opts type to include optional `start_sha`.
3. Update `runScopeCheck` and `RunChecksOptions` with optional `startSha`.
4. Update `graph-generator.ts` scope extraction.
5. Wire call sites (graph-walker `node start` path).

No config changes. No database migrations. No CLI flag changes.

---

## Open Questions

None — all decisions resolved above.
