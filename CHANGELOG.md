# Changelog

All notable changes to Specwork are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Specwork uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

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
