## Context

The current execution model is a flat loop: `getReadyNodes()` → return all → lead spawns all at once. Three files own the behavior: `go.ts` (orchestration), `graph-walker.ts` (node selection), `next-action.ts` (lead instructions). `SKILL.md` contains the lead's operating instructions as prose.

Key constraints:
- `GraphNode` and `WorkflowState` are persisted to YAML — schema changes must be backward-compatible (additive only)
- `buildNextAction` is the contract between the CLI and the lead agent — changing its shape requires updating both
- Existing graphs have no `group` field — they must continue to work without re-generation

## Goals / Non-Goals

**Goals:**
- Cap concurrency at `max_concurrent` (default 5) without requiring graph changes
- Collapse multi-task groups into single agent spawns to reduce context overhead
- Eliminate agent drift by making SKILL.md a lookup table with zero prose interpretation
- Produce richer L1 summaries that cover a group's full output surface
- Remove `parallel_mode` dead code

**Non-Goals:**
- Dynamic re-planning (graph structure is immutable after generation)
- Cross-change concurrency (each `specwork go` manages one change)
- Changing how verification checks work internally (scope-check, tsc-check, etc.)
- Altering the L0/L1/L2 file format — only which node triggers summarization changes

## Decisions

### Decision: Wave cap via `getNextWave()`, not inside `getReadyNodes()`
`getReadyNodes()` is a pure graph query used in multiple places (status, blocking analysis). Adding a cap there would break those consumers. Instead, `go.ts` calls a new `getNextWave(graph, state, maxConcurrent)` that wraps `getReadyNodes()` and slices to N. `getReadyNodes()` stays unchanged.

### Decision: Group collapse in the graph generator, not the engine
Collapsing tasks at generator time means the graph YAML is the source of truth — operators can inspect and override grouping before running `specwork go`. Collapsing at engine runtime would require the engine to infer grouping heuristics, which is non-deterministic.

### Decision: `sub_tasks: string[]` as flat checklist, not nested nodes
Nested nodes (sub-graphs) would require state tracking per sub-task and complicate the verify/retry lifecycle. A flat string array treats sub-tasks as a prompt checklist for the agent — the agent checks them off, the engine verifies the combined scope once. Retry granularity is at the group level, which the user explicitly accepted.

### Decision: State machine table replaces prose SKILL.md
The existing `next_action.command` field already contains the action identifier. Making it always a literal CLI command string (e.g., `specwork node start exec-model-v2 write-tests --json`) removes the interpretation layer entirely. The SKILL.md table maps (current state, incoming event) → next command. No ambiguous words.

### Decision: Wave gate = auto-continue unless failure or `gate: human`
An always-blocking wave gate would slow autonomous runs on clean graphs. The actual need is a pause when something goes wrong or when a node explicitly requires human review. Auto-continue on clean waves preserves the autonomous execution model.

### Decision: Group-level summarization (one L1 per group node)
When a group node completes, the summarizer sees the full diff across all sub-tasks in one call. This produces L1 that captures cross-sub-task decisions (e.g., "added helper X used by both sub-tasks 1 and 2"). Per-sub-task summarization would need a merge step anyway. One call is simpler and produces richer output.

## Architecture

### Data structure changes

**`src/types/config.ts`** — add `max_concurrent` to execution block:
```typescript
execution: {
  max_concurrent: number;   // new, default 5
  max_retries: number;
  expand_limit: number;
  parallel_mode: 'sequential' | 'parallel';  // DEPRECATED — remove reads, keep field for compat
  snapshot_refresh: 'after_each_node' | 'once' | 'never';
}
```

**`src/types/graph.ts`** — add optional fields to `GraphNode`:
```typescript
interface GraphNode {
  // ... existing fields ...
  group?: string;          // new: group label (null = isolated, undefined = no group info)
  sub_tasks?: string[];    // new: checklist items when this is a collapsed group node
}
```

**`src/types/state.ts`** — add wave tracking to `WorkflowState`:
```typescript
interface WorkflowState {
  // ... existing fields ...
  current_wave: number;    // new: increments each time a new wave is dispatched, starts at 0
}
```

### Layer 1: Wave-based execution

**`src/core/graph-walker.ts`** — new export:
```typescript
export function getNextWave(graph, state, maxConcurrent): GraphNode[]
// Returns getReadyNodes() sliced to maxConcurrent.
// Nodes are ordered by topo position for determinism.
```

**`src/cli/go.ts`** — replace `getReadyNodes()` call with `getNextWave()`:
- Read `max_concurrent` from config (default 5 if missing)
- Call `getNextWave(graph, state, maxConcurrent)`
- Increment `current_wave` in state when dispatching a new batch
- Wave gate check: if previous wave had any failure/regression OR any node has `gate: human`, pause; otherwise auto-continue

### Layer 2: Node grouping

**`src/core/graph-generator.ts`** — collapsed group nodes:
- Parse `## N. Group Name` headers → `group = slugify(header)`
- For each group, emit ONE `GraphNode`:
  - `id: impl-{groupIndex}` (not `impl-{g}-{t}` per task)
  - `sub_tasks: [task1.description, task2.description, ...]`
  - `scope`: union of all task scopes in the group
  - `validate`: same rules as current impl nodes, applied to combined scope
  - `group`: the slugified header name
- `group: null` opt-out: if a task line includes `<!-- group: null -->` annotation, it becomes its own isolated node

**Backward compatibility**: Existing graphs have no `group` or `sub_tasks` fields. The engine treats a missing `sub_tasks` as `[]` — single-task node, normal flow.

### Layer 3: Deterministic orchestrator

**`src/core/next-action.ts`** — `buildNextAction` changes:
- `next_action.command` for `go:ready` becomes exact: `specwork node start <change> <nodeId> --json` (first ready node; remaining nodes queued in `ready_queue`)
- All description fields become imperative one-liners, never prose workflows
- New `ready_queue: string[]` field on go:ready response — the lead spawns teammates for all nodes in the queue in parallel

**`.claude/skills/specwork-engine/SKILL.md`** — state machine table format:

```
| CLI Response Status | Event        | Your Next Command                                          |
|---------------------|--------------|------------------------------------------------------------|
| go:ready            | —            | For each node in ready_queue: specwork node start <c> <n> |
| go:waiting          | —            | Wait for teammates → specwork go <c> --json               |
| go:blocked          | —            | Escalate to user                                          |
| go:done             | —            | Present suggest_to_user options                           |
| node:start          | —            | Spawn agent → specwork node verify <c> <n> --json         |
| node:verify:pass    | —            | on_pass command (specwork node complete)                  |
| node:verify:fail    | retries > 0  | on_fail command (specwork node fail → respawn agent)      |
| node:verify:fail    | retries = 0  | specwork node escalate <c> <n>                            |
| node:complete       | —            | specwork go <c> --json                                    |
```

### Layer 4: Group-level summarization

**`.claude/agents/specwork-summarizer.md`** — update prompt to:
- Check if completed node has `sub_tasks[]`
- If yes: include all sub-task descriptions in the L1 "What was built" section
- L0: one line covering the group as a unit (not each sub-task separately)
- L1: list all exports/changes across sub-tasks, note cross-sub-task relationships
- L2: full diff for all files touched by the group

## State Machine Table (complete reference for SKILL.md)

```
INPUT STATE          EVENT/CONDITION         NEXT ACTION
─────────────────────────────────────────────────────────────────────
go:ready             ready_queue non-empty   spawn teammates for all queued nodes
                                             each teammate: specwork node start <c> <n> --json
go:waiting           in_progress > 0         wait → specwork go <c> --json when done
go:blocked           no ready/in-progress    escalate: present blocked_nodes to user
go:done              all terminal            suggest: present suggest_to_user to user

node:start           node is in_progress     spawn agent subagent with assembled context
                                             on finish: specwork node verify <c> <n> --json
node:verify:pass     verdict=PASS            on_pass: specwork node complete <c> <n> --json
node:verify:fail     retries > 0             on_fail: specwork node fail → respawn agent with checks
node:verify:fail     retries = 0             specwork node escalate <c> <n>
node:complete        —                       specwork go <c> --json
node:escalate        —                       present suggest_to_user; cascade-skipped listed

wave:gate            failure in wave         pause; show wave summary; await user decision
wave:gate            gate:human in wave      pause; present node output; await approve/reject
wave:gate            clean wave              auto-continue: specwork go <c> --json
```

## Migration Plan

1. `max_concurrent` defaults to 5 — no config change needed; existing workflows auto-benefit
2. `current_wave` initialized to 0 on new state, treated as 0 if absent (backward compat)
3. `group` and `sub_tasks` are optional on `GraphNode` — existing graphs run unchanged
4. `getNextWave` is additive; `getReadyNodes` stays unchanged
5. Graph re-generation is optional — authors can regenerate to get grouping, or run existing flat graphs as-is
6. SKILL.md rewrite is in-place; no CLI changes needed for the lead to pick it up

## Risks / Trade-offs

- [Group-level retry loses sub-task attribution] → If one sub-task fails, the whole group retries. Mitigated by keeping `sub_tasks[]` in the context so the re-spawned agent knows which checklist item failed based on verify output.
- [Auto-continue wave gate may miss slow regressions] → The gate checks verify results, which include regression detection. Any regression pauses the wave.
- [Collapsed group scope union may be over-broad] → The combined scope of N sub-tasks is larger than any individual task. This slightly weakens scope-check isolation. Accepted as the cost of grouping.

## Open Questions

None — all design decisions confirmed with user.
