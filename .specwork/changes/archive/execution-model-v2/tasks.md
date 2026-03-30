## 1. Type System and Config

- [ ] 1.1 Add `max_concurrent: number` to `SpecworkConfig.execution` in `src/types/config.ts`
- [ ] 1.2 Add optional `group?: string` and `sub_tasks?: string[]` fields to `GraphNode` in `src/types/graph.ts`
- [ ] 1.3 Add `current_wave: number` field to `WorkflowState` in `src/types/state.ts` and initialize it to `0` in `initializeState()` in `src/core/state-machine.ts`

## 2. Wave-based Execution

- [ ] 2.1 Add `getNextWave(graph, state, maxConcurrent)` export to `src/core/graph-walker.ts` that returns `getReadyNodes()` sliced to `maxConcurrent`, ordered by topological position
- [ ] 2.2 Update `src/cli/go.ts` to call `getNextWave` instead of `getReadyNodes`, read `max_concurrent` from config (default 5), increment `current_wave` in state on each dispatch, and apply wave gate logic (auto-continue on clean wave, pause on failure or `gate: human`)

## 3. Node Grouping and Graph Generator

- [ ] 3.1 Update `src/core/graph-generator.ts` to collapse tasks from the same `## N. Header` section into one `GraphNode` with `sub_tasks[]`, combined `scope`, group-aware `id` (`impl-{groupIndex}`), and `group` slug field
- [ ] 3.2 Add `group: null` opt-out support in `src/core/graph-generator.ts`: tasks annotated with `<!-- group: null -->` emit as isolated impl nodes

## 4. Deterministic Orchestrator

- [ ] 4.1 Replace prose `description` fields in `buildNextAction()` in `src/core/next-action.ts` with exact CLI command strings; add `ready_queue: string[]` to the `go:ready` response payload
- [ ] 4.2 Rewrite `.claude/skills/specwork-engine/SKILL.md` as a (state, event) → command lookup table with no prose instructions

## 5. Group-level Context and Summarization

- [ ] 5.1 Update `src/core/context-assembler.ts` to include `sub_tasks[]` in the assembled context payload when the node has sub-tasks, so the agent receives the checklist
- [ ] 5.2 Update `.claude/agents/specwork-summarizer.md` to generate group-level L0/L1/L2 when `sub_tasks[]` is non-empty: L0 covers the group as a unit, L1 captures all exports and cross-sub-task relationships, L2 includes the full diff for all files in the group's scope

<!-- Rules:
     - Every task MUST use - [ ] checkbox format (not tracked otherwise)
     - Group with ## N. numbered headings
     - Number tasks N.M (group.task)
     - Order by dependency — blockers first
     - Each task should be completable in one session
     - These tasks map directly to graph nodes in /project:specwork-graph
-->
