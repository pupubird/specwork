## Why

Specwork agents defer work. They leave TODOs, write stub tests, and mark tasks complete before the work is actually done. This is the #1 source of "green" builds that don't work.

There is no later. When a node is marked complete, it must be complete. The next node builds on it. If a foundation is hollow, every node after it is also hollow — the graph succeeds, the software fails.

Deferral happens at three known points in the current workflow:

1. **The implementer** — `specwork-implementer.md` Rule #3 says "minimum code to make tests pass" but has zero prohibition on TODOs, stubs, or deferred logic. An implementer can write `// TODO: implement this` and the tests can still pass if the test is also hollow.

2. **The test writer** — `specwork-test-writer.md` has no prohibition on test stubs. An agent can write `it('does X', () => { /* TODO */ })` and the tests will technically "fail," satisfying the red-state requirement for the wrong reason.

3. **The lead** — `specwork-go.md` verification runs structural checks (file exists, exports present) but has no semantic completeness audit. A node can PASS verification with deferred logic inside.

`specwork-qa.md` already exists with an adversarial mindset (checks TODO/FIXME/HACK, regression, spec compliance) but is NOT wired into the workflow. It runs nowhere. Its checks catch exactly what we need to catch — and they're ignored.

## What Changes

Five layers of enforcement, from softest (instructions) to hardest (automated blocking):

- **Layer 1**: Anti-deferral rules added to all 6 agent instruction files — explicit prohibition on TODOs, stubs, placeholder tests, and incomplete implementations
- **Layer 2**: New `no-todos` verification check — scans git diff for TODO/FIXME/stub/placeholder patterns, fails the node if found
- **Layer 3**: `specwork-qa` wired into per-node workflow — runs after every verify PASS, before summarizer — catches semantic holes the structural verifier misses
- **Layer 4**: New `go:final-review` engine state — automatic, fires after all nodes complete, spawns specwork-qa for a holistic change review before `go:done`
- **Layer 5**: New `ChangeStatus` value `'final-review'` in type system to support the new state

## Capabilities

### New Capabilities
- `no-todos-check`: Verification check that scans git diffs for deferred work patterns and fails the node
- `per-node-qa`: QA agent runs adversarially after each node verify PASS
- `final-review-state`: Engine state `go:final-review` — holistic QA review of the complete change before done

### Modified Capabilities
- `agent-instructions`: All 6 agent .md files gain explicit anti-deferral rules
- `verification-checks`: New built-in check type `no-todos` added to the check library
- `state-machine`: `go:final-review` state added between last node completion and `go:done`
- `change-status`: `ChangeStatus` union type gains `'final-review'` value

## Impact

All specwork workflows immediately get stronger completion guarantees. The changes are additive — no existing passing workflows break. The only workflows that will fail are ones that were previously succeeding by deferring work.
