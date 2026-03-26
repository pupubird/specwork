## Context

The Foreman planning loop has two structural gaps:

1. **Redundant context discovery**: `foreman-planner` re-reads `.foreman/specs/` and the file tree on every invocation, even though this information is static at planning time and available to the parent slash command.

2. **Inconsistent team usage**: `foreman-go` and `foreman-engine` use bare `Agent` tool calls for node execution. The CLAUDE.md global standard is TeamCreate for all multi-agent work. Foreman predates that standard and was never updated. The `parallel_mode: sequential` default was a placeholder; it should be `parallel`.

## Goals / Non-Goals

**Goals:**
- `foreman-plan` pre-assembles compact context (spec requirement headers + snapshot) before spawning the planner
- `foreman-planner` accepts and uses pre-assembled context, skips redundant reads
- `foreman-go` uses TeamCreate for all node execution
- `foreman-engine` SKILL removes conditional team logic — teams are mandatory
- `config.yaml` parallel_mode defaults to `parallel`

**Non-Goals:**
- No new agent file (user answer Q1: enhance existing, not create new)
- No deep spec reads in pre-assembly (compact headers only, not full content)
- No changes to the graph generation, context assembly CLI, or node types

## Decisions

### Decision: Pre-assembly in slash command, not in agent
The `foreman-plan` slash command already has access to the file system before spawning any agent. It reads spec headers using Grep/Read, runs the snapshot command, and bundles both into a `<planning-context>` block passed as part of the agent's input prompt. The planner agent then starts with that block already loaded — no re-discovery needed.

**Why here, not in the agent**: The slash command runs in the lead agent's context. It's cheaper and faster to do compact reads there than to pay the cost of a fresh subagent context load plus redundant filesystem reads. This matches the "Research happens inside foreman-plan slash command (pre-graph, simpler)" decision (user Q4: A).

### Decision: Spec headers only, not full content
When extracting existing specs for the planning context, only `### Requirement:` header lines are extracted (via Grep). Full scenario text, examples, and descriptions are excluded. This keeps the planning context block under ~500 tokens regardless of how many specs exist.

**Why not full content**: Full specs easily exceed 2000+ tokens for a mature project. The planner needs to know *what capabilities exist* to ask good questions and avoid redundant specs — not the full behavioral detail of each. If the planner needs detail on one specific spec, it can read that file directly (intentional deep-read).

### Decision: TeamCreate for all execution, including single-node sequential
Every foreman execution batch goes through TeamCreate/TeamDelete, even when there is only one node. This enforces a single consistent pattern: the engine skill never uses a bare `Agent` call.

**Why mandatory, not conditional**: The current conditional (`when 3+ nodes ready`) was a transitional heuristic. Teams add negligible overhead but bring observability (TaskCreate/TaskUpdate tracking), lifecycle discipline (TeamDelete), and consistency. Single-node teams are valid and common in CLAUDE.md patterns.

### Decision: parallel_mode default changed to `parallel`
The `sequential` default was conservative. Given that TeamCreate is now mandatory, and parallel mode simply assigns each ready node to a teammate, the default should be `parallel`. Projects that need sequential (e.g., environments with strict resource limits) can explicitly set `parallel_mode: sequential`.

## File Changes

### `.claude/commands/foreman-plan.md`

Add a **pre-assembly step** between "Create the change" and "Spawn foreman-planner":

```
Step 1.5: Assemble planning context
- Read .foreman/specs/ and extract ### Requirement: lines from each file (Grep)
- Run `foreman snapshot --json` (or read latest snapshot) for file tree + deps
- Bundle into <planning-context> block: { specs_headers, file_tree, snapshot_summary }
```

Update agent spawn steps to use TeamCreate:
- Replace direct `Agent` spawn with: TeamCreate → TaskCreate → spawn teammate → TaskUpdate → TeamDelete
- Pass the `<planning-context>` block as part of the teammate's input prompt

### `.claude/agents/foreman-planner.md`

Update Phase 1 (Research) to document the pre-assembled context:
- Add: "You receive a `<planning-context>` block with spec requirement headers + file tree + snapshot"
- Update step list: instead of "Read existing specs", say "Use the spec headers in `<planning-context>` to understand current capabilities"
- Retain the instruction to read a specific spec file if deep detail is needed
- Remove instruction to walk `.foreman/specs/` as a discovery step

### `.claude/commands/foreman-go.md`

Replace the bare `Agent` loop with TeamCreate-based execution:
- After getting ready nodes from `foreman go --json`, create a team
- Create one task per ready node using TaskCreate
- Spawn one teammate per node
- Each teammate runs the full node execution flow (start → context assemble → subagent → verify → complete)
- After batch completes: TeamDelete
- Loop to next batch

### `.claude/skills/foreman-engine/SKILL.md`

Section 5 (Parallel Execution) changes:
- Remove the conditional "When 3+ nodes are ready simultaneously" — TeamCreate is used for ALL batches
- Remove the `parallel_mode` gate entirely — sequential vs parallel only determines whether teammates run concurrently or sequentially, not whether TeamCreate is used
- Update the Quick Reference pseudocode (Section 11) to reflect mandatory team wrapping

### `.foreman/config.yaml`

```yaml
parallel_mode: parallel   # was: sequential
```
Update inline comment to remove the "or parallel for Agent Teams when 3+ nodes ready" caveat.

## Risks / Trade-offs

- [Overhead for tiny workflows] Single-node workflows now go through TeamCreate/TeamDelete → adds ~1-2 tool calls per batch. Acceptable given the consistency benefit.
- [Pre-assembly adds a step to foreman-plan] Grep + snapshot read adds a few seconds before the planner is spawned. Acceptable since it saves more context in the planner.
- [Existing workflows mid-run] If a workflow is in-progress when these changes are deployed, the next `foreman go` will use the new TeamCreate pattern. This is safe — TeamCreate is purely additive.

## Open Questions

None — all decisions resolved by user answers.
