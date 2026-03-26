# Foreman

Foreman is a **spec-driven, test-first, graph-based workflow engine** built entirely on Claude Code primitives. It orchestrates multi-step AI development workflows using a directed graph of nodes, where each node is either a deterministic shell command or an LLM subagent.

**Core philosophy**: Specs before code. Tests before implementation. Context flows, not full conversation dumps.

Everything lives under `.foreman/` — one directory, one unified system.

---

## How to Use Foreman

### Three commands to remember

```bash
# 1. Plan a change — describe what you want in plain English
foreman plan "Add JWT authentication to the API"

# 2. Run the workflow — Foreman drives everything autonomously
foreman go add-jwt-authentication

# 3. Check progress anytime
foreman status
```

### With Claude Code slash commands

```
/project:foreman-plan "Add JWT authentication"
/project:foreman-go add-jwt-authentication
/project:foreman-status
```

### What happens under the hood

1. `foreman plan` creates `.foreman/changes/<name>/` with proposal, design, and tasks templates pre-filled with your description
2. You (or an agent) fill in the details: proposal (WHY), specs (WHAT), design (HOW), tasks (STEPS)
3. `foreman graph generate <name>` maps tasks to a DAG of nodes
4. `foreman go <name>` walks the graph: snapshot → write tests (RED) → implement (GREEN) → verify → commit
5. `foreman status` shows all active changes with progress

One-time setup: `foreman init` (creates `.foreman/` directory structure).

---

## Context System (L0 / L1 / L2)

Foreman uses a tiered context system to give each subagent exactly the right information without bloating the context window.

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

Context files: `.foreman/nodes/<change>/<node-id>/L0.md`, `L1.md`, `L2.md`

---

## Environment Snapshot

Every graph starts with a `snapshot` node (deterministic). It generates:
- File tree (`src/`)
- `package.json` dependencies
- Exported interfaces and types

Subagents MUST use only imports/types from the snapshot — never guess at interfaces.

Snapshot refreshes after each LLM node (configurable in `.foreman/config.yaml`).

---

## Rules

1. **Tests before implementation** — `write-tests` node always runs before any `impl-*` node. Tests must fail (red state) first.
2. **Scope enforcement** — each LLM node declares `scope: [paths]`. The `scope-guard.sh` hook blocks writes outside declared scope.
3. **Immutable tests** — implementer agents cannot modify test files (enforced by scope).
4. **Snapshot-only imports** — subagents use only types/imports visible in the environment snapshot.
5. **Verify before commit** — the verifier agent runs after each node, before any git commit.
6. **Human gates** — `write-tests` node requires human approval before implementation begins.

---

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `.foreman/config.yaml` | Unified config: engine settings + spec conventions |
| `.foreman/schema.yaml` | Artifact dependency graph (proposal → specs → design → tasks) |
| `.foreman/templates/` | Starter templates for proposal, spec, design, tasks |
| `.foreman/specs/` | Source-of-truth specs (current deployed behavior) |
| `.foreman/changes/` | In-flight change proposals (proposal + specs + design + tasks) |
| `.foreman/changes/archive/` | Completed changes (immutable history) |
| `.foreman/graph/<change>/` | `graph.yaml` (plan) + `state.yaml` (runtime status) |
| `.foreman/nodes/<change>/` | Node artifacts: L0/L1/L2, verify.md, output.txt |
| `.foreman/examples/` | Example graphs for reference |
| `.claude/agents/` | Subagent roles (test-writer, implementer, verifier, summarizer) |
| `.claude/skills/` | Engine logic (foreman-engine, foreman-context, foreman-conventions) |
| `.claude/commands/` | Slash commands (foreman-plan, foreman-go, foreman-status) |
| `.claude/hooks/` | Lifecycle hooks (scope-guard, type-check, session-init, node-complete) |

---

## Checking Active Workflows

The `session-init.sh` hook detects active workflows when Claude Code starts:
```
Foreman workflow active: <change-name>. Run `foreman status` for details.
```

Check manually:
```bash
foreman status <change-name>
```

---

## Subagents

| Agent | Model | Role |
|-------|-------|------|
| `foreman-test-writer` | opus | Writes tests from specs (RED state required) |
| `foreman-implementer` | sonnet | Makes tests pass, minimum code, within scope |
| `foreman-verifier` | haiku | Read-only validation, PASS/FAIL per check |
| `foreman-summarizer` | haiku | Generates L0/L1/L2 context for completed nodes |

---

## Spec Conventions (Quick Reference)

Foreman's spec system is a built-in feature. Full details in the `foreman-conventions` skill.

- `### Requirement: Name` — requirement header (3 hashtags)
- `#### Scenario: Name` — scenario header (4 hashtags — **CRITICAL**, never 3)
- `SHALL/MUST` — absolute requirement
- `SHOULD` — recommended
- Specs = behavior contracts only (no class names, no library choices)
- `.foreman/specs/` = source of truth; `.foreman/changes/` = proposed deltas

---

## Configuration

`.foreman/config.yaml` controls everything:

```yaml
models:
  default: sonnet       # Default subagent model
  test_writer: opus     # Test writing (thorough)
  summarizer: haiku     # Context generation (fast)
  verifier: haiku       # Validation (fast)

execution:
  max_retries: 2        # Retry failed nodes up to N times
  expand_limit: 1       # Max EXPAND requests per node
  parallel_mode: sequential   # or "parallel" for Agent Teams
  snapshot_refresh: after_each_node

context:
  ancestors: L0         # All completed nodes get L0
  parents: L1           # Direct deps get L1

spec:
  schema: spec-driven
  specs_dir: .foreman/specs
  changes_dir: .foreman/changes
  templates_dir: .foreman/templates
```
