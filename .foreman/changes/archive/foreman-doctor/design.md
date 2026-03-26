## Context

Foreman has no existing health-check command. The closest thing is `graph-validator.ts` (validates a single graph's node references and structure) and `state-machine.ts` (enforces transition rules at runtime). Neither covers config, specs, archives, changes, templates, or cross-references.

The doctor command is purely diagnostic — it reads artifacts, reports findings, and optionally applies safe auto-repairs. It does not mutate workflow state or trigger agent spawns.

## Goals / Non-Goals

**Goals:**
- Validate all Foreman artifact categories in one command
- Report pass/fail per check with ✓/✗ symbols and summary counts
- Support `--fix` flag for safe, reversible auto-repairs
- Support `--category` flag to limit scope (e.g., `foreman doctor --category specs`)
- Exit code 0 = all pass, exit code 1 = any failures

**Non-Goals:**
- Fixing ambiguous config values (too risky without user intent)
- Deep semantic validation of spec content (e.g., whether requirements make sense)
- Running workflows or spawning agents
- Validating node artifacts inside `.foreman/nodes/` (runtime internals, not user-authored)

## Architecture

### Core Module: `src/core/doctor.ts`

```
DiagnosticResult {
  category: string        // "Config" | "Specs" | "Archives" | ...
  label: string           // human-readable check name
  pass: boolean
  fixable: boolean        // can --fix address this?
  fix?: () => Promise<void>  // auto-repair function (only if fixable)
  detail?: string         // extra info (e.g., line number, file path)
}

CheckResult {
  category: string
  results: DiagnosticResult[]
}

DoctorReport {
  checks: CheckResult[]
  totalPass: number
  totalFail: number
  totalFixable: number
}
```

**Checker functions** (one per category, each returns `CheckResult`):

| Function | File(s) Read |
|----------|-------------|
| `checkConfig()` | `.foreman/config.yaml` |
| `checkSpecs()` | `.foreman/specs/**/*.md`, `.foreman/changes/*/specs/**/*.md` |
| `checkArchives()` | `.foreman/changes/archive/*/` |
| `checkChanges()` | `.foreman/changes/*/` (non-archive) |
| `checkGraphs()` | `.foreman/graph/*/graph.yaml` |
| `checkTemplates()` | `.foreman/templates/` |
| `checkCrossRefs()` | graph.yaml node IDs vs nodes dirs, spec refs in tasks |

**`runDoctor(options)`** orchestrates all checkers, collects `DoctorReport`.

**`applyFixes(report)`** iterates fixable failures and calls their `fix()` function.

### CLI Module: `src/cli/doctor.ts`

```typescript
export function makeDoctorCommand(): Command
```

- Registers `doctor` subcommand on the Commander program
- Options: `--fix`, `--category <name>`
- Calls `runDoctor()` → formats output → calls `applyFixes()` if `--fix`
- Exits with code 1 if any failures remain after optional fix pass

### Registration: `src/index.ts`

Add `.addCommand(makeDoctorCommand())` alongside existing porcelain commands.

## Decisions

### Decision: Checker-per-category architecture
Each category is an independent function returning `CheckResult`. This keeps checker logic isolated (testable in unit tests without instantiating the full doctor), makes it easy to add new categories, and lets `--category` filter at the top level without touching checker internals.

**Alternative considered:** Single monolithic validator. Rejected — harder to test and extend.

### Decision: `fix()` co-located with `DiagnosticResult`
Each fixable result carries its own repair function. This avoids a separate "fix registry" and makes the fix/result relationship explicit — the same code that detects the issue knows how to repair it.

**Alternative considered:** Separate fix module keyed by check ID. Rejected — indirection without benefit for the current scope.

### Decision: Reuse `graph-validator.ts` for graph checks
`src/core/graph-validator.ts` already validates node references and returns `ValidationResult { errors[], warnings[] }`. `checkGraphs()` will call it and map its output to `DiagnosticResult[]` rather than duplicating logic.

### Decision: Spec linting is line-by-line regex
Spec format rules (3# requirements, 4# scenarios, SHALL/SHOULD keywords, GIVEN/WHEN/THEN) are structural text patterns, not semantic. Line-by-line regex is simple, fast, and produces precise line-number error messages.

## Risks / Trade-offs

- [Risk] Archive checker false positives if archive format evolves → Mitigation: checker reads `.foreman.yaml` as the authoritative marker; missing fields are warnings, not errors
- [Risk] Cross-ref checker is slow on large repos → Mitigation: cross-ref check is last; `--category` lets users skip it

## Open Questions

None — all decisions resolved via user input.
