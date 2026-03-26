## Context

`archiveChange()` in `src/core/archive.ts` handles the full archive flow. Spec promotion should be added as a step between copying artifacts and removing originals.

## Goals / Non-Goals

**Goals:**
- Copy all files from `<change>/specs/` to `.foreman/specs/` during archive
- Overwrite existing specs if a change updates them
- Only promote if specs directory exists and has files

**Non-Goals:**
- Spec conflict resolution (last-write-wins is fine)
- Spec validation during promotion
- Retroactive promotion for already-archived changes (manual one-off)

## Decisions

### Decision: Promote during archive, not during node complete
Specs should only be promoted when the ENTIRE change is verified and complete. Promoting per-node would be premature.

### Decision: Overwrite on conflict
If `.foreman/specs/auth.md` already exists and a new change has `specs/auth.md`, overwrite it. The newer change's spec is the current truth.
