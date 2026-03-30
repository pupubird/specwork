## 1. Type System

- [ ] 1.1 Add `'final-review'` to `ChangeStatus` union type in `src/types/graph.ts`
- [ ] 1.2 Update any exhaustive switch/match on `ChangeStatus` in `src/core/state-machine.ts` to handle the new value

## 2. No-Todos Verification Check

- [ ] 2.1 Implement `no-todos` check function in `src/core/verification.ts` — scans `git diff HEAD` for TODO/FIXME/HACK/XXX/PLACEHOLDER/STUB/NOT_IMPLEMENTED patterns, returns list of file:line matches, skips `.specwork/` paths
- [ ] 2.2 Register `no-todos` as a built-in default check in `src/cli/node.ts` so it runs automatically on every node verify, no graph.yaml config required
- [ ] 2.3 Write tests for the `no-todos` check — verify it catches each deferred pattern, verify it skips `.specwork/` files, verify it passes clean diffs

## 3. Final-Review Engine State

- [ ] 3.1 Add `go:final-review` action case to `src/core/next-action.ts` — when all nodes complete and final-review has not run, return `go:final-review` instead of `go:done`
- [ ] 3.2 Add `final-review` state transition logic to `src/core/state-machine.ts` — transitions: `(all nodes done → final-review)`, `(final-review PASS → done)`, `(final-review FAIL → blocked)`
- [ ] 3.3 Update `specwork-go.md` to document `go:final-review` in the state machine table and node execution protocol
- [ ] 3.4 Update `.claude/skills/specwork-engine/SKILL.md` to include `go:final-review` in the state machine documentation

## 4. Per-Node QA Integration

- [ ] 4.1 Update `.claude/commands/specwork-go.md` — add QA step to the node execution lifecycle: after verify PASS → run specwork-qa (diff-scoped) → if FAIL retry (up to max_retries) → proceed to summarizer
- [ ] 4.2 Update `.claude/skills/specwork-engine/SKILL.md` — update state machine table to show per-node QA step between verify and summarizer

## 5. Agent Instruction Updates

- [ ] 5.1 Add anti-deferral rules to `.claude/agents/specwork-implementer.md` — explicit prohibition on TODO/FIXME/stub/placeholder/`throw new Error('not implemented')`; stop and report if unable to complete
- [ ] 5.2 Add no-stub-tests rule to `.claude/agents/specwork-test-writer.md` — every test must have a real assertion; empty or TODO tests are forbidden; tests must fail because implementation doesn't exist, not because test is hollow
- [ ] 5.3 Strengthen TODO-as-failure rule in `.claude/agents/specwork-qa.md` — any TODO/FIXME/stub in diff is automatic FAIL, no exceptions
- [ ] 5.4 Add deferred-work check to `.claude/agents/specwork-verifier.md` — report FAIL if diff contains TODO/FIXME/stub/placeholder/`not implemented` patterns even if all structural checks pass
- [ ] 5.5 Add incomplete-node guard to `.claude/agents/specwork-summarizer.md` — do not generate success summary if node output contains TODO/FIXME markers; report incompleteness instead
- [ ] 5.6 Add completable-tasks rule to `.claude/agents/specwork-planner.md` — do not write tasks that defer with "stub out X for now" or "implement X later"; each task must be fully completable
