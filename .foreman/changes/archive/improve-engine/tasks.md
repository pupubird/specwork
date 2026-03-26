## 1. Archive Feature

- [ ] 1.1 Add `archiveChange(root, change)` function in `src/core/archive.ts` — copies change dir, graph dir, and nodes dir to `.foreman/changes/archive/<name>/`, then removes originals
- [ ] 1.2 Add archive path helpers to `src/utils/paths.ts` — `archiveChangeDir()`, `archiveGraphDir()`, `archiveNodesDir()`
- [ ] 1.3 Wire archive into `foreman go` done detection in `src/cli/go.ts` — call `archiveChange()` when `allTerminal && changeStatus === 'complete'`
- [ ] 1.4 Write tests for archive in `src/__tests__/core/archive.test.ts`

## 2. QA Orchestration

- [ ] 2.1 Update engine skill Section 3 with concrete `needs_qa()` logic and QA agent spawning instructions in `.claude/skills/foreman-engine/SKILL.md`
- [ ] 2.2 Update engine skill Section 5 (Parallel Execution) with agent team patterns
- [ ] 2.3 Update engine skill Section 11 (Quick Reference) with QA in the loop

## 3. Documentation

- [ ] 3.1 Update CLAUDE.md with agent team usage in foreman workflows
- [ ] 3.2 Update `.claude/commands/foreman-go.md` to mention auto-archive behavior
