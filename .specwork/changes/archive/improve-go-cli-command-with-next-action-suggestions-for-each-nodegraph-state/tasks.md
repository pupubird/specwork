## 1. Types & Helpers

- [x] 1.1 Add `NextAction` interface to `src/types/state.ts` with fields: `command`, `description`, `context`, `on_pass?`, `on_fail?`, `suggest_to_user?`
- [x] 1.2 Create `src/core/next-action.ts` with `readChangeContext(changeName: string): string` — reads `.specwork.yaml` description field, returns empty string on error
- [x] 1.3 Implement `buildNextAction(status, context, opts)` in `src/core/next-action.ts` — pure function mapping all workflow states to `NextAction` objects per design mapping table
- [x] 1.4 Export `NextAction`, `readChangeContext`, `buildNextAction` from `src/core/index.ts` (or relevant barrel)

## 2. CLI Integration — go.ts

- [x] 2.1 Import `buildNextAction` and `readChangeContext` in `src/cli/go.ts`
- [x] 2.2 Add `next_action` to `status: ready` response branch in `go.ts` (command: `team:spawn`, includes ready node list)
- [x] 2.3 Add `next_action` to `status: done` response branch in `go.ts` (command: `suggest`, includes `suggest_to_user` array)
- [x] 2.4 Add `next_action` to `status: blocked` response branch in `go.ts` (command: `escalate`, includes blocked node details)
- [x] 2.5 Add `next_action` to `status: waiting` response branch in `go.ts` (command: `wait`, suggests re-running `specwork go`)

## 3. CLI Integration — node.ts

- [x] 3.1 Import `buildNextAction` and `readChangeContext` in `src/cli/node.ts`
- [x] 3.2 Add `next_action` to `node start` response (command: run subagent, then `specwork node complete` or `specwork node fail`)
- [x] 3.3 Add `next_action` to `node complete` response (command: `specwork go` for next batch)
- [x] 3.4 Add `next_action` to `node fail` response — two branches: retries remaining (respawn subagent) vs exhausted (escalate)
- [x] 3.5 Add `next_action` to `node escalate` response (command: `suggest`, includes skipped dependents)
- [x] 3.6 Add `next_action` to `node verify` response — two branches: PASS (complete node) vs FAIL (fail node)

## 4. Trim Engine Instructions

- [x] 4.1 Rewrite `.claude/skills/specwork-engine/SKILL.md` to ≤60 lines: "read next_action, execute command, use on_pass/on_fail for branching" — remove all procedural state-machine documentation
- [x] 4.2 Trim `.claude/commands/specwork-go.md` to ≤10 lines: "run specwork go, read next_action, follow it"

## 5. Tests

- [x] 5.1 Write unit tests for `buildNextAction()` covering all 11 state/status combinations from the mapping table
- [x] 5.2 Write unit tests for `readChangeContext()` — valid file, missing file, missing description field
- [x] 5.3 Write integration tests asserting `specwork go` JSON output contains `next_action` for `ready`, `done`, `blocked`, `waiting` statuses
- [x] 5.4 Write integration tests asserting `specwork node complete/fail/escalate/verify` JSON output contains `next_action` with correct branching fields
