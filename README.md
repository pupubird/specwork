# Specwork

> Spec-driven, test-first, graph-based workflow engine for Claude Code

[![npm version](https://img.shields.io/npm/v/@pupubird/specwork.svg)](https://www.npmjs.com/package/@pupubird/specwork)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

Specwork orchestrates multi-step AI development workflows using a directed acyclic graph (DAG) of nodes. Each node is either a deterministic shell command or an LLM subagent. Every workflow follows the same discipline: **specs first, tests before implementation, verified at every step**.

---

## Features

- **Graph-based DAG execution** — define nodes with explicit dependencies; Specwork walks the graph in order, running nodes in parallel when possible
- **Test-first by design** — `write-tests` node always runs before any implementation node; tests must fail (red state) before any code is written
- **Progressive context (L0/L1/L2)** — subagents receive exactly the context they need: compressed headlines for all completed nodes, full summaries for parent nodes, on-demand expansion for deep dives
- **Scope enforcement** — each LLM node declares the files it may touch; a hook blocks any write outside that scope
- **Human gates** — pause execution at any node and require human approval before continuing
- **Spec-driven conventions** — built-in spec system (proposal → specs → design → tasks) tracks WHY and WHAT before any code is written
- **Claude Code native** — built entirely on Claude Code primitives (agents, hooks, skills, commands); no runtime dependencies beyond Claude Code itself

---

## How It Works

```
Proposal → Specs → Design → Tasks → Graph → Execute → Verify
```

1. **Write a change proposal** describing why and what
2. **Write delta specs** (behavior contracts: GIVEN/WHEN/THEN) for affected capabilities
3. **Generate a graph** from your tasks checklist — Specwork maps each task to a node
4. **Run the workflow** — Specwork walks the graph: snapshot → write tests (RED) → implement node by node (GREEN) → verify
5. **Archive the change** — delta specs merge into source-of-truth specs; artifacts are preserved in history

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    /specwork-run                      │
│              (specwork-engine skill)                  │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────▼────────────┐
          │     Graph Executor      │
          │  reads graph.yaml +     │
          │  state.yaml             │
          └─┬──────────┬───────────┘
            │          │
   ┌────────▼──┐  ┌────▼──────────┐
   │deterministic│  │   llm node   │
   │shell command│  │  (subagent)  │
   └────────────┘  └──────┬───────┘
                          │
              ┌───────────▼──────────┐
              │   Context Assembly   │
              │  L0 (all nodes)      │
              │  L1 (parent nodes)   │
              │  L2 (on EXPAND req)  │
              └───────────┬──────────┘
                          │
          ┌───────────────▼──────────────┐
          │         Subagents            │
          │  test-writer  · implementer  │
          │  verifier     · summarizer   │
          └──────────────────────────────┘
```

**Context tiers:**

| Tier | Who gets it | Size | Content |
|------|-------------|------|---------|
| L0 | All completed nodes | ~10 tokens | One-line headline |
| L1 | Direct parent nodes | ~100 tokens | Files changed, exports, decisions |
| L2 | On-demand (EXPAND) | ~1000+ tokens | Full diff + verify + output |

---

## Quick Start

### Install

```bash
npm install -g @pupubird/specwork
```

### Three commands to remember

```bash
# 1. Initialize (one-time per project)
specwork init

# 2. Plan a change — describe what you want in plain English
specwork plan "Add JWT authentication to the API"

# 3. Run the workflow — Specwork drives everything autonomously
specwork go add-jwt-authentication

# Check progress anytime
specwork status
```

That's it. `plan` creates the change structure and scaffolds all artifacts. `go` runs the full workflow: snapshot → write tests (RED) → implement node by node (GREEN) → verify at each step. `status` shows all active changes with progress.

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
4. `specwork go <name>` walks the graph: environment snapshot → tests (must fail first) → implementation → verification → commit

All the plumbing commands (`node start`, `context assemble`, `scope set`, etc.) are used by the engine internally — you never need to type them.

---

## Project Structure

```
.specwork/
├── config.yaml              # Engine + spec configuration
├── schema.yaml              # Artifact dependency graph
├── templates/               # Proposal, spec, design, tasks starters
├── specs/                   # Source-of-truth specs (current behavior)
├── changes/                 # In-flight change proposals
│   ├── <change-name>/       # proposal + specs + design + tasks
│   └── archive/             # Completed changes (immutable history)
├── graph/                   # Execution graphs
│   └── <change>/
│       ├── graph.yaml       # Node DAG
│       └── state.yaml       # Runtime status
├── nodes/                   # Per-node artifacts (L0/L1/L2, verify, output)
├── examples/                # Reference graphs
└── env/                     # Environment configs (dev/prod)

.claude/
├── agents/                  # Subagent definitions (test-writer, implementer, verifier, summarizer)
├── skills/                  # Engine logic (specwork-engine, specwork-context, specwork-conventions)
├── commands/                # Slash commands (specwork-run, specwork-graph, specwork-status)
└── hooks/                   # Lifecycle hooks (scope-guard, type-check, session-init, node-complete)
```

---

## Subagents

| Agent | Model | Role |
|-------|-------|------|
| `specwork-test-writer` | claude-opus | Writes tests from specs — must all fail (RED state) |
| `specwork-implementer` | claude-sonnet | Makes tests pass, minimum code, within declared scope |
| `specwork-verifier` | claude-haiku | Read-only validation: tsc-check, tests-pass, file-exists, exit-code |
| `specwork-summarizer` | claude-haiku | Generates L0/L1/L2 context artifacts after each node |

---

## Node Types

### `deterministic`

Runs a shell command. Specwork captures stdout/stderr and validates the exit code.

```yaml
- id: snapshot
  type: deterministic
  command: |
    find src -name "*.ts" | head -100 > .specwork/nodes/snapshot/output.txt
  outputs:
    - .specwork/nodes/snapshot/output.txt
```

### `llm`

Spawns a subagent with scoped file access.

```yaml
- id: impl-jwt
  type: llm
  agent: specwork-implementer
  scope:
    - src/auth/jwt.ts
  validate:
    - tsc-check: ""
    - tests-pass: src/__tests__/auth.unit.test.ts
  prompt: |
    Implement JWT token generation and validation.
    Make the unit tests pass.
```

### `human`

Pauses execution and requires manual approval.

```yaml
- id: write-tests
  type: llm
  agent: specwork-test-writer
  gate: human
```

---

## Configuration

`.specwork/config.yaml`:

```yaml
models:
  default: sonnet
  test_writer: opus
  verifier: haiku
  summarizer: haiku

execution:
  max_retries: 2
  expand_limit: 1
  parallel_mode: parallel  # TeamCreate always used; controls concurrency
  snapshot_refresh: after_each_node

context:
  ancestors: L0
  parents: L1

spec:
  specs_dir: .specwork/specs
  changes_dir: .specwork/changes
  templates_dir: .specwork/templates
```

---

## Spec Conventions (Quick Reference)

```markdown
### Requirement: Name          ← 3 hashtags
The system SHALL <behavior>.

#### Scenario: Description     ← 4 hashtags (critical — never 3)
- **GIVEN** <initial state>
- **WHEN** <trigger>
- **THEN** <expected outcome>
```

- `SHALL/MUST` — absolute requirement
- `SHOULD` — recommended, exceptions exist
- `MAY` — optional
- Specs describe **behavior only** — no class names, no library choices
- `.specwork/specs/` = source of truth; `.specwork/changes/` = proposed deltas

---

## Credits

Specwork's spec convention system is based on [OpenSpec](https://github.com/Fission-AI/OpenSpec) by [Fission AI](https://github.com/Fission-AI). The proposal → design → tasks workflow, GIVEN/WHEN/THEN scenario format, and delta spec system were adapted from OpenSpec and integrated as a built-in Specwork feature. We thank the OpenSpec team for their foundational work on spec-driven development.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, PR process, and code style.

## License

MIT — see [LICENSE](LICENSE).
