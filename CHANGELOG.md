# Changelog

All notable changes to Specwork are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Specwork uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

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
