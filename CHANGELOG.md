# Changelog

All notable changes to Specwork are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Specwork uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.6] - 2026-04-10

### Changed — Prompt and Status Only (breaking)

Specwork is now **prompt and status only**. The CLI no longer executes any deterministic checks (type-check, test-runner, file diffs, import resolution). All verification is agent-driven.

**Rationale:** Built-in checks hardcoded `npx vitest run`, breaking jest/mocha/pytest projects. The fundamental problem was that agents know their stack — the CLI doesn't. Removing CLI-side check execution gives agents full flexibility while keeping the CLI as a thin state machine.

**New verification flow:**
1. Impl/test agent finishes work
2. Verifier agent detects test runner from `package.json`, runs tests, runs `tsc --noEmit` if present
3. Agent calls `specwork node verify <change> <node>` on pass → CLI records `verified: true`
4. QA agent re-runs tests independently and adversarially
5. QA agent calls `specwork node qa-pass <change> <node>` on pass
6. Summarizer runs → `specwork node complete`

### Removed

- **`src/core/verification.ts`** (793 lines) — `runChecks`, `runSingleCheck`, `runTestsPass`, `runTestsFail`, `runTscCheck`, `runFilesUnchanged`, `runImportsExist`, `runNoTodos`, `detectRegressions`, `resolveCustomChecks`
- **`BuiltinValidationRuleType`** union (`tests-fail`, `tests-pass`, `tsc-check`, `file-exists`, `exit-code`, `files-unchanged`, `imports-exist`, `no-todos`)
- **`ValidationRule`** type and **`validate`** field from `GraphNode`
- **`VerifyHistoryEntry`**, **`VerifyCheckRecord`**, **`last_verdict`**, **`verify_history`** from `NodeState`
- CLI-side check execution from `specwork node verify` — now a thin state command
- Default validation rules from graph generator
- `expandValidate()` from context assembler (no longer needed)
- `no-todos-check`, `scope-fix`, and integration verification test files (tested deleted code)
- Regression detection from `shouldWaveAutoContinue()` (no verify_history to scan)
- **Per-node git commit** from `specwork node complete` — the CLI no longer auto-commits after each node; committing is left to the agent or developer. Removed `--no-commit` flag.

### Added

- **`specwork node qa-pass <change> <node>`** — new CLI command for QA agents to signal approval
- **Verification Summary** in archive digest — shows `PASS`/`UNVERIFIED` per node based on `verified` field

### Migration

The `0.2.6` migration automatically updates existing projects:
- Rewrites `specwork-verifier.md` with agent-driven verification instructions
- Rewrites `specwork-qa.md` with agent-driven QA instructions
- Removes `validate:` arrays from all active `graph.yaml` files
- Updates `specwork_version` to 0.2.6 in `config.yaml`

[0.2.6]: https://github.com/pupubird/specwork/releases/tag/v0.2.6

## [0.2.0] - 2026-03-30

### Added

- **Wave-based execution** — `max_concurrent` config (default 5) caps how many nodes run simultaneously
  - `getNextWave()` — wraps `getReadyNodes()` with concurrency cap, ordered by topological position
  - `shouldWaveAutoContinue()` — auto-continues clean waves, pauses on failure/regression/`gate: human`
  - `current_wave` tracking in `WorkflowState`
- **Node grouping** — tasks from the same `## N.` section in `tasks.md` collapse into a single graph node
  - `sub_tasks: string[]` field on `GraphNode` — checklist for the agent
  - `group: string` field on `GraphNode` — slugified section header
  - `<!-- group: null -->` opt-out annotation for isolating specific tasks
  - `isGroupNode()`, `getVerificationScope()`, `getRetryContext()`, `getParentL1Sources()` helpers
  - Per-group verification: one verify call covers all sub-tasks in the group
  - Per-group summarization: one L0/L1/L2 captures cross-sub-task relationships
- **Deterministic orchestrator** — SKILL.md rewritten as (state, event) → command lookup table
  - `ready_queue: string[]` on `NextAction` — all ready node IDs in one array
  - `buildNextAction()` returns exact CLI commands, no prose descriptions
  - Lead agent pattern-matches the table with zero interpretation
- 4 new spec files: wave-execution, node-grouping, deterministic-orchestrator, graph-generator-grouping

### Changed

- Graph generator now emits collapsed group nodes (`impl-{groupIndex}`) instead of per-task nodes (`impl-{group}-{task}`)
- `buildNextAction()` description fields are terse imperative labels, not prose workflows
- 46 new tests, 12 old tests updated for grouping behavior (662 total)

### Removed

- `parallel_mode` config field — was never referenced in execution code (dead code since v0.1.0)

### Migration

The `0.2.0` migration automatically updates existing projects:
- Rewrites `specwork-engine/SKILL.md` from prose to state machine table
- Adds `max_concurrent: 5` to `config.yaml` execution block
- Removes deprecated `parallel_mode` from `config.yaml`
- Updates `specwork-summarizer.md` with group-level summarization instructions

[0.2.0]: https://github.com/pupubird/specwork/releases/tag/v0.2.0

## [0.1.3] - 2026-03-29

### Added

- **Micro-spec context engineering** — pre-node context composition replaces uniform context dumps
  - `composeMicroSpec()` — assembles curated context from specs, parent decisions, anti-context, success criteria, filtered snapshot
  - `getSiblings()` — graph walker function for anti-context (sibling scope exclusion)
  - `sliceSpecs()` — resolves `file.md#ScenarioName` references to extract relevant spec scenarios
  - `filterSnapshot()` — filters environment snapshot by node scope globs
  - `getStructuredL1()` / `writeStructuredL1()` — typed L1 with decisions/contracts/enables/changed
  - `expandValidate()` — maps validation rules to human-readable success criteria
- `GraphNode.specs` field — explicit mapping from nodes to spec scenarios in `graph.yaml`
- `StructuredL1` and `MicroSpecBundle` types in `src/types/context.ts`
- `src/core/summarizer.ts` module for structured L1 write operations
- `minimatch` as explicit dependency (used by `filterSnapshot`)
- 5 new spec files: micro-spec-composition, structured-l1, spec-slicing, sibling-anti-context, snapshot-filtering

### Changed

- Summarizer agent updated to write `L1-structured.json` alongside L1.md
- 29 new tests (616 total)

### Migration

The `0.1.3` migration automatically updates existing projects:
- Adds L1-structured.json instructions to summarizer agent
- Cleans up any remaining scope-guard references from CLAUDE.md
- Re-syncs implementer agent from template if scope-guard cleanup was missed

[0.1.3]: https://github.com/pupubird/specwork/releases/tag/v0.1.3

## [0.1.2] - 2026-03-27

### Removed

- Scope guard hook (`scope-guard.sh`) and all scope enforcement references — LLM agents are dynamic by nature and pre-defining file scope was too restrictive
- `PreToolUse` hook entry from `plugin.json`
- `.specwork/.current-scope` runtime file

### Changed

- README rewritten with storytelling narrative, Mermaid diagrams, and collapsible technical sections
- Implementer agent rules simplified (no scope-guard dependency)
- CLAUDE.md rules renumbered after scope enforcement removal

### Migration

The `0.1.2` migration automatically cleans up existing projects:
- Removes `.claude/hooks/scope-guard.sh`
- Removes `.specwork/.current-scope`
- Removes `PreToolUse` scope-guard entry from `plugin.json`
- Cleans scope-guard references from implementer agent

[0.1.2]: https://github.com/pupubird/specwork/releases/tag/v0.1.2

## [0.1.0] - 2026-03-26

### Added

- Graph-based DAG execution engine (`specwork-engine` skill)
- Progressive context system: L0/L1/L2 tiers with EXPAND mechanism (`specwork-context` skill)
- Spec convention system: proposal → specs → design → tasks lifecycle (`specwork-conventions` skill)
- Four subagents: `specwork-test-writer`, `specwork-implementer`, `specwork-verifier`, `specwork-summarizer`
- Slash commands: `/project:specwork-run`, `/project:specwork-graph`, `/project:specwork-status`
- Lifecycle hooks: `session-init`, `scope-guard`, `type-check`, `node-complete`
- Unified configuration under `.specwork/config.yaml`
- Delta spec format: ADDED / MODIFIED / REMOVED / RENAMED requirements
- Example graph: 7-node JWT auth workflow
- Environment configs: `development.yaml`, `production.yaml`
- Artifact templates: proposal, spec, design, tasks

[0.1.0]: https://github.com/specwork-ai/specwork/releases/tag/v0.1.0
