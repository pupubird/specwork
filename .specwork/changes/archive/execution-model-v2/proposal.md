## Why

The current execution model has five compounding problems that make large workflows expensive, fragile, and hard to review:

1. **Unbounded concurrency** — `getReadyNodes()` returns every unblocked node at once. A graph with 20 nodes at the same dependency level spawns 20 simultaneous agents. Cost spikes, reviews become noisy, and the shared worktree causes scope-check failures as agents overwrite each other's uncommitted changes.

2. **No review checkpoints** — The engine sprints from start to finish with no natural pause points. There is nowhere to inspect intermediate state before the next batch starts.

3. **Token waste on trivial nodes** — Every node — even a one-line change — boots a full context assembly cycle (snapshot, L1 from parents, micro-spec composition). A tasks.md with 10 small changes produces 10 separate agent spawns, each paying the full context overhead.

4. **Agent drift** — `SKILL.md` is prose. The lead LLM re-interprets it on every invocation. Under load it skips verification, fuses steps, or hallucinates transitions. The spec `go-next-action.md` requires structured next_action responses, but the `description` field is still English that the agent reads loosely.

5. **Dead configuration** — `parallel_mode` has been in `SpecworkConfig` since v0.1 and has never been read by any execution code. Authors set it and nothing happens.

## What Changes

Three layers of improvement, each independently valuable:

### Layer 1: Wave-based execution with `max_concurrent`
Add a `max_concurrent` config (default 5) that caps how many nodes run simultaneously. `go.ts` calls a new `getNextWave()` that returns at most N ready nodes per call. State tracks the current wave number. Waves auto-continue on success; pause only on failure, regression, or `gate: human`.

### Layer 2: Node grouping for shared-agent execution
The graph generator already understands task groups (from `## N. Group Name` headers in `tasks.md`) but discards that information after wiring dependencies. Under this change, all tasks in the same section collapse into **one** `GraphNode` with a `sub_tasks: string[]` checklist. One agent handles the whole group, one verify call covers its combined scope, and one summarizer run produces a coherent L0/L1/L2 covering the group's full API surface. Authors who need per-task granularity can set `group: null` to opt a node out.

### Layer 3: Deterministic orchestrator loop
`buildNextAction` replaces prose `description` fields with exact CLI command strings. `SKILL.md` becomes a (state, event) → command lookup table — the lead pattern-matches it with zero interpretation. This eliminates agent drift at the source.

### Layer 4: Group-level summarization
Summarizer runs once per collapsed group node, not per sub-task. The resulting L1 captures cross-sub-task relationships, shared exports, and architectural decisions made across the group — giving downstream nodes a single coherent context payload instead of fragmented per-task summaries. This naturally improves `composeMicroSpec` output since parent L1 input is richer.

## Capabilities

### New Capabilities
- `wave-execution`: Cap concurrent node execution with `max_concurrent`; track wave number in state
- `node-grouping`: Collapse same-group tasks into one agent spawn with `sub_tasks[]` checklist
- `deterministic-orchestrator`: State machine table replaces prose SKILL.md; exact CLI commands in next_action
- `graph-generator-grouping`: Auto-group from `##` headers; opt-out via `group: null`

### Modified Capabilities
- `go-next-action`: `buildNextAction` description field becomes exact CLI commands, not prose
- `micro-spec-composition`: Benefits from richer group-level L1 as parent context input

## Impact

- **Cost**: Bounded concurrency + grouping reduces agent spawns on typical graphs by 40–60%
- **Reliability**: Deterministic orchestrator eliminates the class of "agent skipped verification" failures
- **Reviewability**: Wave boundaries give natural inspection points between execution batches
- **Correctness**: Scope-check failures from parallel worktree overlap are eliminated by wave batching
