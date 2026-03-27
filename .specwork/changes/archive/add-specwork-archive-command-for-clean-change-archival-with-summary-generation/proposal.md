# Proposal: specwork archive command

## Why

The `archiveChange()` core function in `src/core/archive.ts` already performs the heavy lifting — copying the change directory, building a digest, promoting specs, and cleaning up graph/nodes artifacts. However, there is no CLI surface for it. Users have no explicit, safe way to trigger archival.

Two alignment gaps also exist in the current core implementation:

1. The generated consolidated file is named `digest.md`, but the doctor's archive integrity check (`foreman-doctor.md`) expects `summary.md`. Every archive produced by the current code will fail the doctor check.
2. The completion guard only inspects unchecked items in `tasks.md`. It does not consult graph state — a change with failed or pending nodes can be archived today.

## What Changes

### New Capabilities
- `archive-command`: `specwork archive <change>` CLI command that safely archives a completed change with user-visible feedback

### Modified Capabilities
- `archive-core`: Rename `digest.md` output to `summary.md`; expose a separate completion-guard function that checks graph node statuses; accept `--force` to bypass the guard

## Impact

- New file: `src/cli/archive.ts` — `makeArchiveCommand()` porcelain command
- Modified: `src/core/archive.ts` — `buildDigest` → `buildSummary`, output file `summary.md`, add `checkCompletion()` guard
- Modified: `src/index.ts` — register archive command in porcelain section
- No changes to paths, doctor, spec format, or state machine

## Non-goals

- Auto-archival triggered from `specwork go` (separate concern)
- Archiving multiple changes in one invocation
- Undo/restore from archive
