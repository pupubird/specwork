# Specwork

Specwork is a **spec-driven, test-first, graph-based workflow engine** built entirely on Claude Code primitives. It orchestrates multi-step AI development workflows using a directed graph of nodes, where each node is either a deterministic shell command or an LLM subagent.

**Core philosophy**: Specs before code. Tests before implementation. Context flows, not full conversation dumps.

Everything lives under `.specwork/` — one directory, one unified system.

---

## How to Use Specwork

### Three commands to remember

```bash
# 1. Plan a change — describe what you want in plain English
specwork plan "Add JWT authentication to the API"

# 2. Run the workflow — Specwork drives everything autonomously
specwork go add-jwt-authentication

# 3. Check progress anytime
specwork status
```

### With Claude Code slash commands

```
/project:specwork-plan "Add JWT authentication"
/project:specwork-go add-jwt-authentication
/project:specwork-status
```

### What happens under the hood

1. `specwork plan` creates `.specwork/changes/<name>/` with proposal, design, and tasks templates pre-filled with your description
2. You (or an agent) fill in the details: proposal (WHY), specs (WHAT), design (HOW), tasks (STEPS)
3. `specwork graph generate <name>` maps tasks to a DAG of nodes
4. `specwork go <name>` walks the graph: snapshot → write tests (RED) → implement (GREEN) → verify → commit
5. `specwork status` shows all active changes with progress

One-time setup: `specwork init` (creates `.specwork/` directory structure).

---

## Context System (L0 / L1 / L2)

Specwork uses a tiered context system to give each subagent exactly the right information without bloating the context window.

| Tier | Scope | Size | Content |
|------|-------|------|---------|
| **L0** | ALL completed nodes | ~10 tokens each | One-line status + key stat |
| **L1** | PARENT nodes only | ~100 tokens each | Files, exports, decisions |
| **L2** | On-demand via EXPAND | ~1000+ tokens | Full diff + verify + output |

**How it works:**
1. Every completed node gets an L0 summary (ultra-compressed headline)
2. Subagents receive L0 for all nodes + L1 for their direct dependencies
3. If a subagent needs full details from a previous node, it outputs `EXPAND(node-id)` as its first line
4. The engine loads L2 of that node and re-spawns the subagent (once)

Context files: `.specwork/nodes/<change>/<node-id>/L0.md`, `L1.md`, `L2.md`

---

## Environment Snapshot

Every graph starts with a `snapshot` node (deterministic). It generates:
- File tree (`src/`)
- `package.json` dependencies
- Exported interfaces and types

Subagents MUST use only imports/types from the snapshot — never guess at interfaces.

Snapshot refreshes after each LLM node (configurable in `.specwork/config.yaml`).

---

## Rules

1. **Tests before implementation** — `write-tests` node always runs before any `impl-*` node. Tests must fail (red state) first.
2. **Immutable tests** — implementer agents cannot modify test files.
3. **Snapshot-only imports** — subagents use only types/imports visible in the environment snapshot.
4. **Verify before commit** — the verifier agent runs after each node, before any git commit.
5. **Human gates** — `write-tests` node requires human approval before implementation begins.
6. **Auto-archive** — completed changes are automatically archived to `.specwork/changes/archive/` when `specwork go` detects all nodes are done.

---

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `.specwork/config.yaml` | Unified config: engine settings + spec conventions |
| `.specwork/schema.yaml` | Artifact dependency graph (proposal → specs → design → tasks) |
| `.specwork/templates/` | Starter templates for proposal, spec, design, tasks |
| `.specwork/specs/` | Source-of-truth specs (current deployed behavior) |
| `.specwork/changes/` | In-flight change proposals (proposal + specs + design + tasks) |
| `.specwork/changes/archive/` | Completed changes (auto-archived on workflow completion) |
| `.specwork/graph/<change>/` | `graph.yaml` (plan) + `state.yaml` (runtime status) |
| `.specwork/nodes/<change>/` | Node artifacts: L0/L1/L2, verify.md, output.txt |
| `.specwork/examples/` | Example graphs for reference |
| `.claude/agents/` | Subagent roles (test-writer, implementer, verifier, summarizer) |
| `.claude/skills/` | Engine logic (specwork-engine, specwork-context, specwork-conventions) |
| `.claude/commands/` | Slash commands (specwork-plan, specwork-go, specwork-status) |
| `.claude/hooks/` | Lifecycle hooks (type-check, session-init, node-complete) |

---

## Checking Active Workflows

The `session-init.sh` hook detects active workflows when Claude Code starts:
```
Specwork workflow active: <change-name>. Run `specwork status` for details.
```

Check manually:
```bash
specwork status <change-name>
```

---

## Subagents

| Agent | Model | Role |
|-------|-------|------|
| `specwork-test-writer` | opus | Writes tests from specs (RED state required) |
| `specwork-implementer` | sonnet | Makes tests pass, minimum code, within scope |
| `specwork-verifier` | haiku | Read-only validation, PASS/FAIL per check |
| `specwork-summarizer` | haiku | Generates L0/L1/L2 context for completed nodes |

### Agent Teams (Mandatory)

All specwork execution uses Agent Teams (TeamCreate/TeamDelete). This is mandatory for both planning (`specwork-plan`) and execution (`specwork-go`), regardless of node count or `parallel_mode` setting. The `parallel_mode` config (default: `parallel`) controls whether teammates run concurrently or sequentially within the team — it does not control whether teams are used. Use Sonnet for implementation teammates, Opus for planning.

---

## Spec Conventions (Quick Reference)

Specwork's spec system is a built-in feature. Full details in the `specwork-conventions` skill.

- `### Requirement: Name` — requirement header (3 hashtags)
- `#### Scenario: Name` — scenario header (4 hashtags — **CRITICAL**, never 3)
- `SHALL/MUST` — absolute requirement
- `SHOULD` — recommended
- Specs = behavior contracts only (no class names, no library choices)
- `.specwork/specs/` = source of truth; `.specwork/changes/` = proposed deltas

---

## Configuration

`.specwork/config.yaml` controls everything:

```yaml
models:
  default: sonnet       # Default subagent model
  test_writer: opus     # Test writing (thorough)
  summarizer: haiku     # Context generation (fast)
  verifier: haiku       # Validation (fast)

execution:
  max_retries: 2        # Retry failed nodes up to N times
  expand_limit: 1       # Max EXPAND requests per node
  parallel_mode: parallel      # TeamCreate always used; controls concurrency within team
  snapshot_refresh: after_each_node

context:
  ancestors: L0         # All completed nodes get L0
  parents: L1           # Direct deps get L1

spec:
  schema: spec-driven
  specs_dir: .specwork/specs
  changes_dir: .specwork/changes
  templates_dir: .specwork/templates
```
