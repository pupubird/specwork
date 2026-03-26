# Foreman

> Spec-driven, test-first, graph-based workflow engine for Claude Code

[![npm version](https://img.shields.io/npm/v/@pupubird/foreman.svg)](https://www.npmjs.com/package/@pupubird/foreman)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

Foreman orchestrates multi-step AI development workflows using a directed acyclic graph (DAG) of nodes. Each node is either a deterministic shell command or an LLM subagent. Every workflow follows the same discipline: **specs first, tests before implementation, verified at every step**.

---

## Features

- **Graph-based DAG execution** — define nodes with explicit dependencies; Foreman walks the graph in order, running nodes in parallel when possible
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
3. **Generate a graph** from your tasks checklist — Foreman maps each task to a node
4. **Run the workflow** — Foreman walks the graph: snapshot → write tests (RED) → implement node by node (GREEN) → verify
5. **Archive the change** — delta specs merge into source-of-truth specs; artifacts are preserved in history

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    /foreman-run                      │
│              (foreman-engine skill)                  │
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
npm install -g @pupubird/foreman
```

Or use directly with Claude Code — Foreman runs as a set of slash commands:

```
/project:foreman-graph <change-name>
/project:foreman-run <change-name>
/project:foreman-status <change-name>
```

### Create a change

```bash
mkdir -p .foreman/changes/add-auth
cp .foreman/templates/proposal.md .foreman/changes/add-auth/proposal.md
# Edit proposal.md: why are you making this change?

cp .foreman/templates/tasks.md .foreman/changes/add-auth/tasks.md
# Edit tasks.md: what are the implementation steps?
```

### Generate the execution graph

```
/project:foreman-graph add-auth
```

Reads `proposal.md`, `design.md`, `tasks.md` → generates `.foreman/graph/add-auth/graph.yaml`.

### Run the workflow

```
/project:foreman-run add-auth
```

Foreman walks the graph: environment snapshot → tests (red) → [await human gate] → implementation nodes → verification.

### Check status

```
/project:foreman-status add-auth
```

---

## Project Structure

```
.foreman/
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
├── skills/                  # Engine logic (foreman-engine, foreman-context, foreman-conventions)
├── commands/                # Slash commands (foreman-run, foreman-graph, foreman-status)
└── hooks/                   # Lifecycle hooks (scope-guard, type-check, session-init, node-complete)
```

---

## Subagents

| Agent | Model | Role |
|-------|-------|------|
| `foreman-test-writer` | claude-opus | Writes tests from specs — must all fail (RED state) |
| `foreman-implementer` | claude-sonnet | Makes tests pass, minimum code, within declared scope |
| `foreman-verifier` | claude-haiku | Read-only validation: tsc-check, tests-pass, file-exists, exit-code |
| `foreman-summarizer` | claude-haiku | Generates L0/L1/L2 context artifacts after each node |

---

## Node Types

### `deterministic`

Runs a shell command. Foreman captures stdout/stderr and validates the exit code.

```yaml
- id: snapshot
  type: deterministic
  command: |
    find src -name "*.ts" | head -100 > .foreman/nodes/snapshot/output.txt
  outputs:
    - .foreman/nodes/snapshot/output.txt
```

### `llm`

Spawns a subagent with scoped file access.

```yaml
- id: impl-jwt
  type: llm
  agent: foreman-implementer
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
  agent: foreman-test-writer
  gate: human
```

---

## Configuration

`.foreman/config.yaml`:

```yaml
models:
  default: sonnet
  test_writer: opus
  verifier: haiku
  summarizer: haiku

execution:
  max_retries: 2
  expand_limit: 1
  parallel_mode: sequential  # or "parallel"
  snapshot_refresh: after_each_node

context:
  ancestors: L0
  parents: L1

spec:
  specs_dir: .foreman/specs
  changes_dir: .foreman/changes
  templates_dir: .foreman/templates
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
- `.foreman/specs/` = source of truth; `.foreman/changes/` = proposed deltas

---

## Credits

Foreman's spec convention system is based on [OpenSpec](https://github.com/Fission-AI/OpenSpec) by [Fission AI](https://github.com/Fission-AI). The proposal → design → tasks workflow, GIVEN/WHEN/THEN scenario format, and delta spec system were adapted from OpenSpec and integrated as a built-in Foreman feature. We thank the OpenSpec team for their foundational work on spec-driven development.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, PR process, and code style.

## License

MIT — see [LICENSE](LICENSE).
