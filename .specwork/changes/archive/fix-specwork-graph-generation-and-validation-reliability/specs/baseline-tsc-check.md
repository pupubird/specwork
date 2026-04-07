# Spec: Baseline-Aware tsc-check

## Overview

The `tsc-check` validation rule SHALL compare TypeScript errors against a baseline captured at the node's `start_sha`. Only errors NOT present in the baseline SHALL cause the check to FAIL. This prevents pre-existing type errors from blocking node validation.

---

### Requirement: Baseline Error Capture

When `startSha` is available, `runTscCheck` SHALL capture the baseline set of tsc errors by running `tsc --noEmit` against the codebase state at `startSha`. The baseline errors SHALL be compared against the current errors to identify only errors introduced by the node's work.

#### Scenario: Node introduces no new errors
Given a project with 10 pre-existing type errors at `startSha`
And the node's implementation does not introduce any new type errors
When `tsc-check` runs with `startSha` set
Then the check SHALL return PASS
And the detail SHALL indicate "No new type errors (10 pre-existing)"

#### Scenario: Node introduces new errors
Given a project with 10 pre-existing type errors at `startSha`
And the node's implementation introduces 2 new type errors in `src/core/foo.ts`
When `tsc-check` runs with `startSha` set
Then the check SHALL return FAIL
And the `errors` array SHALL contain only the 2 new errors
And the detail SHALL indicate "2 new type error(s) found (10 pre-existing)"

#### Scenario: Node fixes pre-existing errors
Given a project with 10 pre-existing type errors at `startSha`
And the node's implementation fixes 3 of those errors and introduces 0 new ones
When `tsc-check` runs with `startSha` set
Then the check SHALL return PASS

---

### Requirement: Error Identity for Baseline Comparison

Errors SHALL be compared using a composite key of `file`, `code` (e.g., TS2322), and a normalized message. Line numbers SHALL NOT be part of the identity key because other nodes' changes may shift line numbers without affecting the error itself.

#### Scenario: Same error with shifted line number is recognized as pre-existing
Given a baseline error at `src/foo.ts:42` with code `TS2322`
And after the node's work, the same error appears at `src/foo.ts:45` with code `TS2322` and the same message
When baseline comparison runs
Then the error SHALL be recognized as pre-existing (not new)
And it SHALL NOT appear in the `errors` array

#### Scenario: Different error in same file is recognized as new
Given a baseline error at `src/foo.ts` with code `TS2322` message "Type 'string' not assignable to 'number'"
And the node introduces a new error at `src/foo.ts` with code `TS2345` message "Argument of type 'X' not assignable"
When baseline comparison runs
Then the TS2345 error SHALL be recognized as new
And it SHALL appear in the `errors` array

---

### Requirement: Fallback Chain

When baseline capture is not possible, `runTscCheck` SHALL fall back to progressively less accurate strategies:

1. **Baseline diff** (preferred): `startSha` available + git operations succeed → diff error sets
2. **Scope filter**: `startSha` unavailable or git fails + `scope` is non-empty → only report errors in files within `scope`
3. **Full check**: no `startSha` and empty `scope` → current behavior (fail on any error)

#### Scenario: startSha is null — falls back to scope filter
Given `startSha` is null
And the node's `scope` is `["src/core/"]`
And there are type errors in `src/core/foo.ts` and `src/utils/bar.ts`
When `tsc-check` runs
Then only the error in `src/core/foo.ts` SHALL be reported
And the error in `src/utils/bar.ts` SHALL be excluded

#### Scenario: Git operations fail — falls back to scope filter
Given `startSha` is set but git baseline capture fails
And the node's `scope` is `["src/core/"]`
When `tsc-check` runs
Then it SHALL fall back to scope-filtered behavior
And SHALL NOT throw an error or crash

#### Scenario: No startSha and empty scope — full check
Given `startSha` is null and `scope` is empty
When `tsc-check` runs
Then it SHALL behave identically to the current implementation (fail on any error)
