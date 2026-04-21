# Spec: Verification Layer

## Overview

Verification is agent-driven. The CLI is a thin state machine — it does not execute test runners, type checkers, or file diff checks. Agents detect their own stack and run verification themselves.

**Flow:** impl/test agent → verifier agent (runs tests + tsc) → `specwork node verify` → QA agent → `specwork node qa-pass` → summarizer → `specwork node complete`

---

### Requirement: Agent-Driven Verification

The CLI SHALL NOT execute any built-in checks (test runners, type checkers, import resolution, diff scanning). Verification is entirely performed by the `specwork-verifier` and `specwork-qa` subagents.

#### Scenario: Verifier detects test runner from package.json

- **GIVEN** a project with `jest` in `package.json` devDependencies
- **WHEN** the verifier agent starts
- **THEN** it SHALL run `npx jest` (not `npx vitest run`)
- **AND** it SHALL NOT hardcode any test runner command

#### Scenario: Verifier skips tsc when no tsconfig.json

- **GIVEN** a project with no `tsconfig.json` at the root
- **WHEN** the verifier agent runs
- **THEN** it SHALL skip the TypeScript check step entirely

---

### Requirement: specwork node verify is a Thin State Command

`specwork node verify <change> <node>` SHALL only update state — it does not run any checks.

#### Scenario: verify records verified=true

- **GIVEN** a node in `in_progress` status
- **WHEN** `specwork node verify <change> <node>` is called
- **THEN** `state.nodes[nodeId].verified` SHALL be set to `true`
- **AND** the command SHALL return a `node:verify:pass` next_action

#### Scenario: verify fails if node is not in_progress

- **GIVEN** a node in `pending` or `complete` status
- **WHEN** `specwork node verify <change> <node>` is called
- **THEN** the command SHALL fail with an error

---

### Requirement: specwork node qa-pass Signals QA Approval

`specwork node qa-pass <change> <node>` signals that the QA agent has approved the node. After this, the summarizer runs and the node can be completed.

#### Scenario: qa-pass returns node:qa:pass next_action

- **GIVEN** a node with `verified: true`
- **WHEN** `specwork node qa-pass <change> <node>` is called
- **THEN** the command SHALL return a `node:qa:pass` next_action pointing to the summarizer

---

### Requirement: Verification Result in Node State

The `NodeState` type SHALL track verification outcome via the `verified` boolean field.

#### Scenario: Node state after successful verification

- **GIVEN** a node in `in_progress` status
- **WHEN** `specwork node verify` is called
- **THEN** `state.nodes[nodeId].verified` SHALL be `true`

---

### Requirement: Archive Digest Shows Verification Status

When a change is archived, the `digest.md` SHALL include a Verification Summary table showing the `verified` status per node as PASS or UNVERIFIED.

#### Scenario: Verified nodes show PASS in digest

- **GIVEN** a completed change where all nodes have `verified: true`
- **WHEN** the change is archived
- **THEN** `digest.md` SHALL contain a `## Verification Summary` section
- **AND** each node SHALL show `PASS` in the Verdict column
