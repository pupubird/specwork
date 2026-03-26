# Spec: Verification Layer

## Overview

Verification is the trust layer of Specwork. Every node MUST pass verification before being marked complete. Verification is mandatory and cannot be disabled. The system provides built-in check types, supports custom project-specific checks, executes checks in dependency order with fail-fast semantics, returns structured actionable feedback, and tracks verification history across retries.

---

### Requirement: Verification is Mandatory

The system SHALL NOT provide any configuration option to skip or disable verification. Every node that transitions to `complete` status MUST have passed verification. The `verify: none` configuration option SHALL NOT exist.

#### Scenario: No skip option in config

- **GIVEN** a `.specwork/config.yaml` with `verify: none`
- **WHEN** the config is loaded
- **THEN** the system SHALL reject the config with an error explaining that verification cannot be disabled

#### Scenario: Node completion requires verification

- **GIVEN** a node in `in_progress` status
- **WHEN** `specwork node complete` is called without a prior passing verification
- **THEN** the system SHALL reject the completion and return a `next_action` pointing to `specwork node verify`

---

### Requirement: Scope Enforcement Check

The `scope-check` validation rule SHALL compare all files modified during node execution against the node's declared `scope` patterns. A file is "in scope" if its path starts with any pattern in the `scope` array. Any file outside scope SHALL cause the check to FAIL.

#### Scenario: All changes within scope

- **GIVEN** a node with `scope: ["src/auth/"]`
- **AND** `git diff --name-only` shows `src/auth/jwt.ts` and `src/auth/middleware.ts`
- **WHEN** the `scope-check` runs
- **THEN** the check SHALL return PASS

#### Scenario: Changes outside scope

- **GIVEN** a node with `scope: ["src/auth/"]`
- **AND** `git diff --name-only` shows `src/auth/jwt.ts` and `src/db/schema.ts`
- **WHEN** the `scope-check` runs
- **THEN** the check SHALL return FAIL
- **AND** the detail SHALL list each out-of-scope file: `src/db/schema.ts`

#### Scenario: Empty scope allows nothing

- **GIVEN** a node with `scope: []`
- **AND** `git diff --name-only` shows any changed files
- **WHEN** the `scope-check` runs
- **THEN** the check SHALL return FAIL for every changed file

---

### Requirement: Files Unchanged Check

The `files-unchanged` validation rule SHALL verify that specified files have no modifications (zero `git diff` output). This is used to enforce test immutability during implementation — implementer agents MUST NOT modify test files.

#### Scenario: Protected files untouched

- **GIVEN** an impl node with `validate: [{ type: "files-unchanged", args: { files: ["src/__tests__/auth.test.ts"] } }]`
- **AND** `git diff src/__tests__/auth.test.ts` produces empty output
- **WHEN** the `files-unchanged` check runs
- **THEN** the check SHALL return PASS

#### Scenario: Protected file modified

- **GIVEN** an impl node with `validate: [{ type: "files-unchanged", args: { files: ["src/__tests__/auth.test.ts"] } }]`
- **AND** `git diff src/__tests__/auth.test.ts` produces non-empty output
- **WHEN** the `files-unchanged` check runs
- **THEN** the check SHALL return FAIL
- **AND** the detail SHALL name the modified file

---

### Requirement: Imports Exist Check

The `imports-exist` validation rule SHALL parse import statements in all files within the node's `scope` and verify each import resolves to an actual file or package. This prevents agents from inventing non-existent modules.

#### Scenario: All imports resolve

- **GIVEN** a node with scope `["src/auth/"]`
- **AND** `src/auth/jwt.ts` imports from `../utils/crypto.js` and `jsonwebtoken`
- **AND** `src/utils/crypto.ts` exists and `jsonwebtoken` is in `package.json` dependencies
- **WHEN** the `imports-exist` check runs
- **THEN** the check SHALL return PASS

#### Scenario: Import resolves to non-existent file

- **GIVEN** a node with scope `["src/auth/"]`
- **AND** `src/auth/jwt.ts` imports from `../utils/magic-helper.js`
- **AND** `src/utils/magic-helper.ts` does NOT exist
- **WHEN** the `imports-exist` check runs
- **THEN** the check SHALL return FAIL
- **AND** the detail SHALL name the unresolvable import and the file that imports it

---

### Requirement: Scoped Test Execution

The `tests-fail` and `tests-pass` validation rules SHALL scope test execution to the node's relevant test files when specified, not run the entire test suite. The `args.file` field specifies which test file(s) to run.

#### Scenario: tests-fail scoped to node's test files

- **GIVEN** a write-tests node with `validate: [{ type: "tests-fail", args: { file: "src/__tests__/auth.test.ts" } }]`
- **WHEN** the `tests-fail` check runs
- **THEN** only `src/__tests__/auth.test.ts` SHALL be executed
- **AND** if those tests fail, the check SHALL return PASS (RED state confirmed)

#### Scenario: tests-pass scoped to node's test files

- **GIVEN** an impl node with `validate: [{ type: "tests-pass", args: { file: "src/__tests__/auth.test.ts" } }]`
- **WHEN** the `tests-pass` check runs
- **THEN** only `src/__tests__/auth.test.ts` SHALL be executed
- **AND** if those tests pass, the check SHALL return PASS

---

### Requirement: Check Execution Order and Fail-Fast

Checks SHALL execute in a defined dependency order. If a check fails and the `fail_fast` option is enabled (default: true), subsequent checks that depend on the failed check SHALL be skipped with status `SKIPPED` and a detail explaining which prerequisite failed.

The default execution order SHALL be:
1. `file-exists` (cheapest — filesystem stat)
2. `scope-check` (cheap — git diff + pattern match)
3. `files-unchanged` (cheap — git diff on specific files)
4. `imports-exist` (medium — parse + resolve)
5. `tsc-check` (expensive — full type check)
6. `tests-fail` / `tests-pass` (most expensive — test execution)
7. `exit-code` (variable — custom commands)

#### Scenario: tsc-check fails, tests-pass is skipped

- **GIVEN** a node with `validate: [{ type: "tsc-check" }, { type: "tests-pass" }]`
- **AND** fail_fast is enabled (default)
- **WHEN** `tsc-check` returns FAIL
- **THEN** `tests-pass` SHALL be SKIPPED with detail "Skipped: prerequisite tsc-check failed"
- **AND** the overall verdict SHALL be FAIL

#### Scenario: fail_fast disabled runs all checks

- **GIVEN** a node with `validate: [{ type: "tsc-check" }, { type: "tests-pass" }]`
- **AND** `fail_fast: false` in the validation config
- **WHEN** `tsc-check` returns FAIL
- **THEN** `tests-pass` SHALL still execute
- **AND** all check results SHALL be included in the verdict

---

### Requirement: Structured Error Output

Every check result SHALL include structured, actionable information — not truncated string blobs. The `CheckResult` type SHALL include:

- `type` (string) — the check type
- `status` ('PASS' | 'FAIL' | 'SKIPPED') — the outcome
- `detail` (string) — human-readable summary
- `errors` (array, optional) — structured error objects for FAIL results
- `duration_ms` (number) — how long the check took

Each error object in the `errors` array SHALL include:
- `file` (string, optional) — file path where the error occurred
- `line` (number, optional) — line number
- `message` (string) — the error message
- `code` (string, optional) — error code (e.g., TS2322)

#### Scenario: tsc-check returns structured errors

- **GIVEN** a TypeScript file with a type error on line 42
- **WHEN** `tsc-check` runs
- **THEN** the check result SHALL include `errors: [{ file: "src/auth/jwt.ts", line: 42, message: "Type 'string' is not assignable...", code: "TS2322" }]`

#### Scenario: tests-pass returns structured failures

- **GIVEN** a test file with 2 failing tests
- **WHEN** `tests-pass` runs
- **THEN** the check result SHALL include `errors` with one entry per failing test, including the test name and assertion message

---

### Requirement: Custom Check Types

Projects SHALL be able to define custom validation checks in `.specwork/config.yaml` under a `checks` key. Custom checks are shell commands with expected outcomes.

```yaml
checks:
  lint:
    command: "npx eslint {scope}"
    expect: exit-0
    description: "ESLint passes on all scoped files"
    phase: [impl, integration]
  format:
    command: "npx prettier --check {scope}"
    expect: exit-0
    description: "Prettier formatting is correct"
    phase: [impl]
```

Custom checks SHALL be usable in `validate` arrays alongside built-in checks. The `{scope}` placeholder SHALL be replaced with the node's scope paths joined by spaces.

#### Scenario: Custom lint check in validation

- **GIVEN** a custom check `lint` defined in config
- **AND** a node with `validate: [{ type: "lint" }]`
- **WHEN** verification runs
- **THEN** the system SHALL execute `npx eslint src/auth/` (with scope substitution)
- **AND** return PASS if exit code is 0, FAIL otherwise

#### Scenario: Custom check with phase filtering

- **GIVEN** a custom check `lint` with `phase: [impl]`
- **AND** the current node is a `write-tests` node
- **WHEN** the graph generator creates validation rules
- **THEN** the `lint` check SHALL NOT be included for write-tests nodes

---

### Requirement: Verification History

The system SHALL track verification results across retries for the same node. Each verification run SHALL be appended to a history array in the node's state, not overwritten.

The verification history SHALL include:
- `attempt` (number) — which retry this was (1-indexed)
- `verdict` (PASS | FAIL)
- `timestamp` (ISO 8601)
- `checks` (CheckResult[])
- `regression` (boolean) — true if a previously-passing check now fails

#### Scenario: Second retry shows regression

- **GIVEN** a node that was verified on attempt 1 with `tsc-check: PASS, tests-pass: FAIL`
- **AND** the node is retried and verified on attempt 2
- **AND** attempt 2 shows `tsc-check: FAIL, tests-pass: PASS`
- **WHEN** the verification result is recorded
- **THEN** `tsc-check` SHALL be marked as `regression: true`
- **AND** the `next_action` SHALL highlight the regression in its description

#### Scenario: Verification history is preserved in verify.md

- **GIVEN** a node that has been verified 3 times
- **WHEN** `verify.md` is written
- **THEN** it SHALL contain all 3 attempts with their results, not just the latest

---

### Requirement: Verification Verdict in Node State

The `NodeState` type SHALL include verification-specific fields:

- `verified` (boolean) — whether the node has passed verification
- `verify_history` (array) — all verification attempts
- `last_verdict` ('PASS' | 'FAIL' | null) — most recent verdict

#### Scenario: Node state after successful verification

- **GIVEN** a node in `in_progress` status
- **WHEN** `specwork node verify` returns PASS
- **THEN** `state.nodes[nodeId].verified` SHALL be `true`
- **AND** `state.nodes[nodeId].last_verdict` SHALL be `'PASS'`

#### Scenario: Node complete blocked without verified=true

- **GIVEN** a node with `verified: false`
- **WHEN** `specwork node complete` is called
- **THEN** the command SHALL fail with an error: "Node must pass verification before completion"
- **AND** the `next_action` SHALL point to `specwork node verify`

---

### Requirement: Cross-Node Validation

When a node completes, the system SHALL verify that the node's outputs don't break previously-completed nodes. This is a lightweight "integration check" that runs parent-node test files.

#### Scenario: Impl node doesn't break sibling's tests

- **GIVEN** `impl-1-1` is complete with passing tests
- **AND** `impl-1-2` just finished implementation
- **WHEN** `impl-1-2` is verified
- **THEN** the system SHALL also run `impl-1-1`'s test files (if specified)
- **AND** if `impl-1-1`'s tests now fail, the verdict SHALL be FAIL with detail "Cross-node regression: impl-1-1 tests broken"

---

### Requirement: Verification Config

The `execution.verify` config key SHALL only accept `strict` or `gates`:

- `strict` — every node is verified (default)
- `gates` — only nodes with `gate: human` and the integration node are verified; other nodes get auto-PASS

The value `none` SHALL NOT be accepted. If encountered, the system SHALL throw a configuration error.

#### Scenario: verify: none rejected

- **GIVEN** a config with `verify: none`
- **WHEN** any specwork command loads the config
- **THEN** the system SHALL exit with error: "verify: none is not allowed. Verification is mandatory. Use 'strict' or 'gates'."

---

### Requirement: Check Result Output Size

Check details SHALL NOT be arbitrarily truncated. Instead:

- Structured `errors` array captures individual errors (no limit)
- The `detail` summary field SHALL be at most 200 characters
- The full output (stdout/stderr) SHALL be written to the node's artifact directory as `verify-output.txt`
- The JSON response SHALL include a `full_output_path` field pointing to this file

#### Scenario: Large tsc output preserved

- **GIVEN** a TypeScript project with 50 type errors
- **WHEN** `tsc-check` runs
- **THEN** the `errors` array SHALL contain all 50 errors (structured)
- **AND** `detail` SHALL say "50 type errors found"
- **AND** the raw `tsc` output SHALL be saved to `verify-output.txt`

---

### Requirement: Default Validation Rules Per Node Type

The graph generator SHALL assign default validation rules based on node type and role:

| Node | Default Checks |
|------|---------------|
| `snapshot` | `file-exists` |
| `write-tests` | `tsc-check`, `tests-fail` (scoped), `scope-check` |
| `impl-*` | `scope-check`, `files-unchanged` (test files), `imports-exist`, `tsc-check`, `tests-pass` (scoped) |
| `integration` | `tests-pass` (full suite), plus all custom checks with `phase: [integration]` |

#### Scenario: Impl node gets files-unchanged for test files

- **GIVEN** a graph is being generated
- **WHEN** an impl node is created
- **THEN** it SHALL include `{ type: "files-unchanged", args: { files: ["src/__tests__/"] } }` in its validate array
- **AND** it SHALL include `scope-check` and `imports-exist`

#### Scenario: Integration node includes custom checks

- **GIVEN** a custom check `lint` with `phase: [integration]`
- **WHEN** the integration node is generated
- **THEN** its validate array SHALL include `{ type: "lint" }`
