## 1. Core: completion guard + summary.md fix

- [ ] 1.1 Add `checkCompletion(root, change)` to `src/core/archive.ts` — reads `state.yaml` if present, checks all nodes are terminal and none failed/escalated; falls back to tasks.md unchecked-item check; returns `{ ok: boolean; blocking: string[] }`
- [ ] 1.2 Rename `buildDigest` → `buildSummary` in `src/core/archive.ts` and change the output filename from `digest.md` to `summary.md`
- [ ] 1.3 Update `archiveChange()` in `src/core/archive.ts` to write `summary.md` (not `digest.md`), set `archived_at` field in the archive copy's `.specwork.yaml`, and remove the old tasks.md-only completion guard (callers use `checkCompletion()` instead)

## 2. CLI: archive command

- [ ] 2.1 Create `src/cli/archive.ts` with `makeArchiveCommand()` — argument `<change>`, options `--force`; validate change exists, validate archive destination does not already exist, call `checkCompletion()` (respecting `--force`), call `archiveChange()`, collect result metadata
- [ ] 2.2 Add human-readable output to `makeArchiveCommand()` — print archive destination path, list promoted spec files (or "none"), confirm graph/nodes cleanup; emit `warn()` if `--force` was used
- [ ] 2.3 Add `--json` output to `makeArchiveCommand()` — emit `{ change, archive_path, specs_promoted, nodes_cleaned, forced }` via `output()`
- [ ] 2.4 Register `makeArchiveCommand()` in `src/index.ts` porcelain section and update the help text block to include `specwork archive <change>`

## 3. Tests

- [ ] 3.1 Write unit tests for `checkCompletion()` — covers: all complete (passes), pending nodes (blocks), failed nodes (blocks), no state.yaml with checked tasks.md (passes), no state.yaml with unchecked tasks (blocks)
- [ ] 3.2 Write unit tests for the `summary.md` output — verify file is named `summary.md`, verify node timeline section present, verify verification summary table present when verdicts exist
- [ ] 3.3 Write integration tests for `specwork archive` CLI — covers: success path produces correct archive, already-archived destination errors cleanly, `--force` on failed-node change produces warn output, partial-copy protection (destination exists → no files moved)
