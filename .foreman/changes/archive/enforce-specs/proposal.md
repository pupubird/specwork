## Why

The workflow claims to be "spec-driven" but specs are never actually written. The planner agent treats specs as optional ("if behavior contracts are needed"), so every change skips them. `.foreman/specs/` is permanently empty. Tests aren't derived from specs — they're improvised.

This breaks the core philosophy: **specs before code, tests before implementation**.

## What Changes

1. **Planner agent** — make spec generation mandatory in Phase 2/YOLO, not optional
2. **Graph generator** — feed spec files as inputs to write-tests node so tests are spec-driven
3. **Planner agent** — generate at least one spec file per change, even for internal refactors

## Capabilities

### Modified Capabilities
- `planner`: Spec generation becomes mandatory, not optional
- `graph-generator`: write-tests node receives spec files as inputs

## Impact

- `.claude/agents/foreman-planner.md` — strengthen spec requirement
- `src/core/graph-generator.ts` — add spec files to write-tests inputs
- `.foreman/specs/` — will actually be populated going forward
