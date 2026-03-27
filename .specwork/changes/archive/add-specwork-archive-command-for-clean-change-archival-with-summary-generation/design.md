# Design: specwork archive command

## Context

`src/core/archive.ts` already contains `archiveChange()` which copies the change directory, builds a consolidated summary, promotes specs, updates `.specwork.yaml`, and removes runtime directories. The current implementation has two correctness gaps:

1. The output file is named `digest.md` but the doctor check expects `summary.md`.
2. The completion guard reads `tasks.md` for unchecked checkboxes only — it does not consult `state.yaml` graph node statuses.

The goal is to add a CLI wrapper and fix both gaps with minimal surface area change.

## Goals / Non-Goals

**Goals:**
- Expose `specwork archive <change>` as a porcelain CLI command
- Align `digest.md` → `summary.md` to satisfy existing doctor integrity check
- Add graph-state-aware completion guard (fall back to tasks.md when no state exists)
- Report spec promotion results in CLI output
- Support `--json` for agent consumption
- Support `--force` to skip completion guard (escape hatch)

**Non-Goals:**
- Auto-archival from `specwork go`
- Multi-change archival
- Undo/restore

## Decisions

### Decision: Fix digest.md → summary.md in core, not CLI shim
The doctor check looks for `summary.md` by name. Fixing the name in `archiveChange()` directly means all callers (future auto-archive, CLI) produce the correct output. A shim rename in the CLI layer would leave the core inconsistent.

### Decision: Graph-state guard in `checkCompletion()` — separate from `archiveChange()`
The guard is extracted so `specwork go` can call it in its auto-archive path without duplicating logic. It accepts `root` and `change` and returns `{ ok: boolean; blocking: string[] }`.

### Decision: Fall back to tasks.md when no state.yaml
Changes that were planned but never run (no graph generated) may still be archivable if all tasks are manually checked off. Preserving the existing tasks.md behavior as a fallback maintains backward compatibility.

### Decision: Atomic copy-then-delete (not move)
`fs.cpSync` + `fs.rmSync` is used instead of `fs.renameSync` because source and destination may be on different volumes (or within the same `.specwork/` subtree). The existing core already uses this pattern.

### Decision: Partial-copy protection
The archive destination is checked for existence before any copy begins. If it exists, the command errors immediately. This prevents double-archiving and partial overwrites.

## Architecture

```
src/cli/archive.ts          makeArchiveCommand()
  └─ calls checkCompletion()     (new export from src/core/archive.ts)
  └─ calls archiveChange()       (existing, modified)
  └─ outputs result via output() / success() / warn()

src/core/archive.ts
  ├─ checkCompletion(root, change) → { ok, blocking }   [NEW]
  ├─ buildSummary(root, change)   → string               [renamed from buildDigest]
  └─ archiveChange(root, change)  → void                 [modified: summary.md, uses checkCompletion internally]

src/index.ts
  └─ import makeArchiveCommand from ./cli/archive.js
  └─ program.addCommand(makeArchiveCommand())   // porcelain section
```

## Archive Flow

```
specwork archive <change>
  1. findSpecworkRoot()
  2. Validate change directory exists
  3. Validate archive destination does NOT exist
  4. checkCompletion(root, change)
     - If state.yaml exists: check all nodes are terminal + none failed/escalated
     - Else: check tasks.md for unchecked items
     - If not ok and no --force: throw SpecworkError with blocking list
     - If --force: emit warn()
  5. archiveChange(root, change)
     a. cpSync changes/<change>/ → changes/archive/<change>/
     b. buildSummary() → write changes/archive/<change>/summary.md
     c. cpSync specs/ → .specwork/specs/ (per file)
     d. Update archive copy's .specwork.yaml: status=archived, archived_at=<ISO date>
     e. rmSync changes/<change>/
     f. rmSync graph/<change>/
     g. rmSync nodes/<change>/
  6. Collect results: archive_path, specs_promoted[], nodes_cleaned
  7. Output (human or JSON)
```

## summary.md Format

```markdown
# Summary: <change-name>

**Archived:** YYYY-MM-DD | **Nodes:** N | **Status:** complete

## Description

<content from .specwork.yaml description field>

## Node Timeline

- **snapshot**: environment captured — 42 files, 6 exported types
- **write-tests**: 12 tests written, all RED
- **impl-auth**: JWT middleware implemented, all tests GREEN

## Node Details

### write-tests
<L1 content>

### impl-auth
<L1 content>

## Verification Summary

| Node | Verdict |
|------|---------|
| impl-auth | PASS |
| write-tests | PASS |
```

## Risks / Trade-offs

[Rename digest.md → summary.md] → Any existing archives produced before this change will have `digest.md` instead of `summary.md` and will fail the doctor check. Mitigation: `specwork doctor --fix` can be extended to rename `digest.md` → `summary.md` in existing archives (not part of this change, but the `--fix` hook in doctor is already designed for this).

[--force flag] → Users can archive incomplete work. Mitigation: the forced warning is printed prominently and the `forced: true` field is set in the `.specwork.yaml` metadata.
