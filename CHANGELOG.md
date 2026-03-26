# Changelog

All notable changes to Foreman are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Foreman uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-03-26

### Added

- Graph-based DAG execution engine (`foreman-engine` skill)
- Progressive context system: L0/L1/L2 tiers with EXPAND mechanism (`foreman-context` skill)
- Spec convention system: proposal → specs → design → tasks lifecycle (`foreman-conventions` skill)
- Four subagents: `foreman-test-writer`, `foreman-implementer`, `foreman-verifier`, `foreman-summarizer`
- Slash commands: `/project:foreman-run`, `/project:foreman-graph`, `/project:foreman-status`
- Lifecycle hooks: `session-init`, `scope-guard`, `type-check`, `node-complete`
- Unified configuration under `.foreman/config.yaml`
- Delta spec format: ADDED / MODIFIED / REMOVED / RENAMED requirements
- Example graph: 7-node JWT auth workflow
- Environment configs: `development.yaml`, `production.yaml`
- Artifact templates: proposal, spec, design, tasks

[0.1.0]: https://github.com/foreman-ai/foreman/releases/tag/v0.1.0
