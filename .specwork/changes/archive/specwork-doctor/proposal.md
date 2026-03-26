## Why

Specwork's artifact system grows over time: specs, change proposals, archived workflows, config, graphs, and templates. Currently, there is no automated way to verify that these artifacts are well-formed. Developers discover problems only when a workflow fails mid-run — e.g., a malformed spec causes a test-writer agent to miss requirements, or a broken graph reference causes `specwork go` to crash.

A `specwork doctor` command gives developers an instant health check across all Specwork artifacts before they run a workflow. It surfaces config mistakes, spec formatting violations, malformed graphs, broken cross-references, and archive inconsistencies in one pass — with a clear pass/fail report and an optional `--fix` flag for safe auto-repairs.

## What Changes

### New Capabilities
- `specwork-doctor`: A CLI command that validates all Specwork artifacts and reports diagnostics with ✓/✗ symbols, category grouping, and summary counts. Supports `--fix` for safe auto-repairs and `--category` to limit scope.

### Modified Capabilities
- `cli-registration`: `src/index.ts` registers the new `doctor` command alongside `init`, `plan`, `go`, and `status`.

## Capabilities

### Validation Categories

| Category | What Is Checked |
|----------|----------------|
| **Config** | `.specwork/config.yaml` exists, required keys present (models, execution, spec, graph), value types correct |
| **Specs** | `### Requirement` headers (3#), `#### Scenario` headers (4# only, never 3#), SHALL/SHOULD/MAY keywords used, GIVEN/WHEN/THEN structure in scenarios |
| **Archives** | Each archive dir has `.specwork.yaml` with `status: archived`, required files present (`proposal.md`, `design.md`, `tasks.md`, `summary.md`), no loose `graph.yaml`/`state.yaml`/`nodes/` |
| **Changes** | In-flight change dirs have required files, tasks use `- [ ]` checkbox format, group headings use `## N.` pattern |
| **Graphs** | `graph.yaml` is valid YAML, all node deps reference valid node IDs, no cycles |
| **Templates** | All expected templates exist in `.specwork/templates/` |
| **Cross-refs** | Node IDs in `graph.yaml` match node dirs, spec files referenced in tasks exist, change dirs referenced in graph state exist |

### Output Format

```
specwork doctor

Config
  ✓ .specwork/config.yaml exists
  ✓ Required keys present (models, execution, spec, graph)
  ✗ execution.parallel_mode: unknown value "sequential-legacy"

Specs (3 files)
  ✓ planning-context.md: all requirements and scenarios valid
  ✓ spec-enforcement.md: all requirements and scenarios valid
  ✗ team-enforcement.md: line 42 — scenario uses ### (3#) instead of #### (4#)

Archives (2 dirs)
  ✓ add-planner: complete
  ✓ close-planning-loop: complete

Changes (1 dir)
  ✓ specwork-doctor: all required files present, tasks well-formed

Graphs (0 active)
  ✓ No active graphs

Templates
  ✓ All 4 templates present

Cross-references
  ✓ All cross-references valid

─────────────────────────────────
Results: 11 passed, 2 failed
Run `specwork doctor --fix` to auto-repair fixable issues (1 fixable)
```

### Auto-fix (--fix flag)

Safe auto-repairs only — no destructive changes:
- Normalize `#### Scenario` headers that accidentally use `###`
- Add missing `status: archived` to `.specwork.yaml` when other archive markers confirm it
- Create missing template files from built-in defaults

Not auto-fixed (too risky):
- Config value corrections (user intent unclear)
- Graph cycle resolution
- Missing required files (cannot infer content)

## Impact

- No breaking changes to existing workflows
- New files: `src/core/doctor.ts`, `src/cli/doctor.ts`
- Modified files: `src/index.ts` (register command)
- New spec: `.specwork/changes/specwork-doctor/specs/specwork-doctor.md`
