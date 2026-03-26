# Specwork

> Your AI agent keeps forgetting what it's supposed to do halfway through. Specwork fixes that.

[![npm version](https://img.shields.io/npm/v/specwork.svg)](https://www.npmjs.com/package/specwork)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

Specwork is a **spec-driven, test-first workflow engine** built and optimized for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with **Agent Teams**. It breaks complex changes into a graph of small, verifiable steps — and guides the AI agent through every single one without losing focus.

> **Note:** Specwork currently requires Claude Code with Agent Teams support. It uses `TeamCreate`/`TeamDelete`, subagent spawning, hooks, and skills — all Claude Code primitives. No other AI coding tools are supported at this time.

---

## The Problem

Ask an AI agent to build something non-trivial and watch what happens:

- It forgets the original goal after 3-4 steps
- It skips writing tests, or writes them after the code
- It modifies files it shouldn't touch
- It loses track of what's done and what's left
- When something fails, it spirals instead of recovering gracefully

You end up babysitting the agent, re-explaining context, and fixing drift. The bigger the task, the worse it gets.

## How Specwork Solves This

**Specs before code. Tests before implementation. Context flows, never dumps.**

Specwork decomposes your change into a directed acyclic graph (DAG) of nodes. Each node is a small, scoped unit of work — either a shell command or an LLM subagent. The engine walks the graph and at every step tells the agent exactly what to do next.

Three key mechanisms make this work:

### 1. Gradual Reveal

Instead of loading a 500-line instruction manual upfront (which the agent will forget), Specwork embeds the next instruction directly in each CLI response:

```json
{
  "status": "ready",
  "next_action": {
    "command": "team:spawn",
    "description": "Spawn teammates for ready nodes",
    "context": "Add JWT authentication to the API"
  }
}
```

The agent never needs to remember the full workflow — it just follows `next_action`.

### 2. Context Reinforcement

Every `next_action` includes a `context` field pulled from your original change description. The agent is reminded of the user's intent at every state transition, so it never drifts off-task.

### 3. Progressive Context (L0 / L1 / L2)

Subagents get exactly the context they need — not a full conversation dump:

| Tier   | Scope                | Size          | Content                               |
| ------ | -------------------- | ------------- | ------------------------------------- |
| **L0** | All completed nodes  | ~10 tokens    | One-line headline                     |
| **L1** | Parent nodes only    | ~100 tokens   | Files changed, exports, key decisions |
| **L2** | On-demand (`EXPAND`) | ~1000+ tokens | Full diff, verification output        |

This keeps the context window lean while ensuring no information is lost.

---

## Quick Start

### Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and configured (with Agent Teams support)
- Node.js >= 18

### Install

```bash
npm install -g specwork
```

### Initialize (one-time per project)

```bash
cd your-project
specwork init
```

This creates the `.specwork/` directory, config, templates, and all Claude Code integration files (agents, skills, commands, hooks). Everything is batteries-included.

### Three commands to remember

```bash
# 1. Plan a change — describe what you want in plain English
specwork plan "Add JWT authentication to the API"

# 2. Run the workflow — Specwork drives everything autonomously
specwork go add-jwt-authentication

# 3. Check progress anytime
specwork status
```

That's it. `plan` scaffolds the change structure. `go` runs the full workflow. `status` shows progress.

### Or use Claude Code slash commands

```
/project:specwork-plan "Add JWT authentication"
/project:specwork-go add-jwt-authentication
/project:specwork-status
```

---

## How It Works

```
You describe a change
        │
        ▼
┌──────────────────┐
│   specwork plan   │  Scaffolds: proposal (WHY) → specs (WHAT) → design (HOW) → tasks (STEPS)
└────────┬─────────┘
         ▼
┌──────────────────┐
│  graph generate   │  Maps tasks to a DAG of nodes with dependencies
└────────┬─────────┘
         ▼
┌──────────────────┐
│   specwork go     │  Walks the graph autonomously:
│                    │
│  snapshot ─────────│──▶ Capture project state (file tree, deps, exports)
│  write-tests ─────│──▶ Tests first — they MUST fail (RED)
│  implement ───────│──▶ Make tests pass, minimum code, scoped files only (GREEN)
│  verify ──────────│──▶ Type-check, test-pass, scope-check at every step
│  commit ──────────│──▶ Atomic commits per node
└──────────────────┘
```

The engine uses **Agent Teams** — Claude Code's multi-agent primitive — as its core execution model. Every batch of ready nodes gets a dedicated team: teammates execute in parallel, and the team is cleaned up before the next batch. This is mandatory for all Specwork execution, regardless of node count or workflow complexity.

---

## Philosophy

### Specs are the source of truth

Every change starts with a behavior spec — not code. Specs use `SHALL/MUST/SHOULD` keywords and `GIVEN/WHEN/THEN` scenarios to describe what the system should do, not how. Implementation details (class names, libraries) stay out of specs.

```markdown
### Requirement: Token Validation

The system SHALL reject expired JWT tokens with a 401 status code.

#### Scenario: Expired token submitted

- **GIVEN** a JWT token with `exp` in the past
- **WHEN** the token is submitted to any authenticated endpoint
- **THEN** the system responds with HTTP 401 and error body `{"error": "token_expired"}`
```

### Tests prove the spec, code satisfies the tests

The `write-tests` node runs before any implementation. Tests are written from specs and must fail (red state). Implementation nodes then make them pass — nothing more. Implementer agents cannot modify test files.

### Scope keeps agents honest

Each node declares the files it may touch. A scope guard hook blocks any write outside that boundary. An implementer working on `src/auth/jwt.ts` cannot accidentally modify `src/db/schema.ts`.

### Failures are handled, not ignored

When a node fails, the engine knows what to do:

- **Retries remaining?** Re-spawn the subagent with error context
- **Retries exhausted?** Escalate to the user with actionable suggestions
- **Blocked by dependencies?** Report which nodes are stuck and why

Every failure path has a `next_action`. The agent never gets stuck in a loop.

---

## Architecture

```
.specwork/
├── config.yaml              # Engine + spec configuration
├── specs/                   # Source-of-truth behavior specs
├── changes/                 # In-flight changes (proposal + specs + design + tasks)
│   └── <change-name>/
├── graph/<change>/
│   ├── graph.yaml           # Node DAG (dependencies, scope, validation)
│   └── state.yaml           # Runtime state (status per node)
├── nodes/<change>/          # Per-node artifacts (L0/L1/L2, verify output)
└── templates/               # Starter templates for proposals, specs, design, tasks

.claude/
├── agents/                  # Subagent definitions
├── skills/                  # Engine logic
├── commands/                # Slash commands
└── hooks/                   # Lifecycle hooks (scope-guard, type-check)
```

### Subagents

| Agent                  | Model  | Role                                                      |
| ---------------------- | ------ | --------------------------------------------------------- |
| `specwork-test-writer` | opus   | Writes tests from specs — must all fail (RED)             |
| `specwork-implementer` | sonnet | Makes tests pass, minimum code, scoped files only         |
| `specwork-verifier`    | haiku  | Read-only validation: type-check, tests pass, files exist |
| `specwork-summarizer`  | haiku  | Generates L0/L1/L2 context after each node                |

### Node Types

**`deterministic`** — Runs a shell command. Captures stdout/stderr, validates exit code.

**`llm`** — Spawns a scoped subagent. Declares which files it may touch, what validation to run, and optionally requires a human gate.

**`human`** — Pauses execution for manual approval before continuing.

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
  parallel_mode: parallel
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

## CLI Reference

| Command                                  | Description                                                         |
| ---------------------------------------- | ------------------------------------------------------------------- |
| `specwork init`                          | Initialize project (creates `.specwork/` + Claude Code integration) |
| `specwork plan "<description>"`          | Create a new change from a plain-English description                |
| `specwork go <change>`                   | Run the workflow — walks the graph autonomously                     |
| `specwork status [change]`               | Show progress for all or a specific change                          |
| `specwork graph generate <change>`       | Generate DAG from tasks.md                                          |
| `specwork graph show <change>`           | Display the node graph                                              |
| `specwork node start <change> <node>`    | Start a specific node                                               |
| `specwork node complete <change> <node>` | Mark a node complete                                                |
| `specwork node fail <change> <node>`     | Mark a node failed                                                  |
| `specwork node verify <change> <node>`   | Run verification checks                                             |
| `specwork archive <change>`              | Archive a completed change                                          |
| `specwork doctor [change]`               | Health-check project or change artifacts                            |

All commands support `--json` for machine-readable output with `next_action` guidance.

---

## Credits

Specwork's spec convention system is based on [OpenSpec](https://github.com/Fission-AI/OpenSpec) by [Fission AI](https://github.com/Fission-AI). The proposal/design/tasks workflow, GIVEN/WHEN/THEN scenario format, and delta spec system were adapted from OpenSpec and integrated as a built-in feature.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, PR process, and code style.

## License

MIT — see [LICENSE](LICENSE).
