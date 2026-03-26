# Spec: Structured Next Action in CLI Responses

## Overview

Every Specwork CLI JSON response SHALL include a `next_action` field that tells the agent exactly what to do next. This enables "gradual reveal" — workflow knowledge moves from the agent's memory (SKILL.md) into the state machine's responses.

---

### Requirement: Structured Next Action in JSON Responses

Every JSON response from `specwork go`, `specwork node start`, `specwork node complete`, `specwork node fail`, `specwork node escalate`, and `specwork node verify` SHALL include a `next_action` field.

The `next_action` field SHALL be a JSON object with the following fields:
- `command` (string, required) — the action to take next
- `description` (string, required) — human-readable explanation of the action
- `context` (string, required) — original change intent (see Requirement: Context Reinforcement)
- `on_pass` (string, optional) — command to run on success
- `on_fail` (string, optional) — command to run on failure
- `suggest_to_user` (string array, optional) — suggestions when workflow is complete

#### Scenario: specwork go with ready nodes returns spawn action

GIVEN a change with nodes in `pending` state whose dependencies are met
WHEN the agent runs `specwork go <change-name>`
THEN the JSON response SHALL include `next_action.command` equal to `"team:spawn"`
AND `next_action.description` SHALL mention spawning one teammate per ready node
AND the ready node IDs SHALL be enumerable from the response

#### Scenario: specwork node start returns subagent execution action

GIVEN a node has been started and is now `in_progress`
WHEN the agent runs `specwork node start <change-name> <node-id>`
THEN the JSON response SHALL include `next_action.command` that instructs spawning the appropriate subagent
AND `next_action.on_pass` SHALL be `"specwork node complete <node-id> --summary '<L0>'"` (with placeholder)
AND `next_action.on_fail` SHALL be `"specwork node fail <node-id> --reason '<error>'"` (with placeholder)

#### Scenario: specwork node complete returns go-again action

GIVEN a node has been marked complete
WHEN the agent runs `specwork node complete <change-name> <node-id> --summary '<L0>'`
THEN the JSON response SHALL include `next_action.command` equal to `"specwork go <change-name>"`
AND `next_action.description` SHALL indicate running go again to pick up the next batch

#### Scenario: specwork node verify PASS returns complete action

GIVEN a verifier has run and all checks passed
WHEN the agent runs `specwork node verify <change-name> <node-id> --result pass`
THEN the JSON response SHALL include `next_action.command` that instructs completing the node
AND `next_action.on_pass` SHALL be `"specwork node complete <node-id> --summary '<L0>'"` (with placeholder)

#### Scenario: specwork node verify FAIL returns fail action

GIVEN a verifier has run and one or more checks failed
WHEN the agent runs `specwork node verify <change-name> <node-id> --result fail`
THEN the JSON response SHALL include `next_action.command` that instructs failing the node
AND `next_action.on_fail` SHALL be `"specwork node fail <node-id> --reason '<error>'"` (with placeholder)

#### Scenario: specwork node fail with retries remaining returns respawn action

GIVEN a node has failed and has retries remaining
WHEN the agent runs `specwork node fail <change-name> <node-id> --reason '<error>'`
THEN the JSON response SHALL include `next_action.command` that instructs respawning the subagent with failure feedback
AND the response SHALL indicate the number of retries remaining

#### Scenario: specwork node fail with no retries returns escalate action

GIVEN a node has failed and has exhausted all retries
WHEN the agent runs `specwork node fail <change-name> <node-id> --reason '<error>'`
THEN the JSON response SHALL include `next_action.command` equal to `"specwork node escalate <node-id>"`
AND `next_action.description` SHALL mention reporting to the user for manual intervention

#### Scenario: specwork node escalate returns user-facing suggestion

GIVEN a node has been escalated
WHEN the agent runs `specwork node escalate <change-name> <node-id>`
THEN the JSON response SHALL include `next_action.command` equal to `"suggest"`
AND `next_action.suggest_to_user` SHALL include options for manual fix or skip
AND the response SHALL list any dependent nodes that were cascade-skipped

---

### Requirement: Context Reinforcement

Every `next_action` object SHALL include a `context` field containing the change description from `.specwork.yaml`.

#### Scenario: context field populated from .specwork.yaml

GIVEN a change has a `.specwork.yaml` with a non-empty `description` field
WHEN the agent runs any `specwork go` or `specwork node` command
THEN `next_action.context` SHALL equal the `description` value from `.specwork.yaml`

#### Scenario: context field is empty string when .specwork.yaml is missing or has no description

GIVEN a change has no `.specwork.yaml` or the file has no `description` field
WHEN the agent runs any `specwork go` or `specwork node` command
THEN `next_action.context` SHALL be an empty string
AND the CLI SHALL NOT error or exit non-zero due to missing context

---

### Requirement: Conditional Branching

Where a CLI command results in an outcome that can pass or fail, `next_action` SHALL include both `on_pass` and `on_fail` fields.

Commands with branching outcomes: `specwork node start`, `specwork node verify`.

`on_pass` and `on_fail` values SHALL be executable CLI command strings with angle-bracket placeholders (e.g., `<node-id>`, `<L0>`, `<error>`) for the agent to fill in.

#### Scenario: on_pass and on_fail present for node start

GIVEN any node start response
THEN `next_action.on_pass` SHALL be present and SHALL reference `specwork node complete`
AND `next_action.on_fail` SHALL be present and SHALL reference `specwork node fail`

#### Scenario: on_pass and on_fail present for node verify

GIVEN any node verify response
THEN `next_action.on_pass` SHALL be present and SHALL reference completing the node
AND `next_action.on_fail` SHALL be present and SHALL reference failing the node

---

### Requirement: Done State Suggestions

When `specwork go` returns `status: done`, the response SHALL include `next_action.suggest_to_user` as a non-empty array of suggested follow-up actions for the user.

#### Scenario: done state includes user-facing suggestions

GIVEN all nodes in a change are in a terminal state (complete, skipped, escalated)
WHEN the agent runs `specwork go <change-name>`
THEN `next_action.command` SHALL equal `"suggest"`
AND `next_action.suggest_to_user` SHALL contain at least: archive the change, review the output, request changes

#### Scenario: blocked state includes escalation suggestion

GIVEN all remaining nodes are blocked (no nodes are ready or in-progress)
WHEN the agent runs `specwork go <change-name>`
THEN `next_action.command` SHALL equal `"escalate"`
AND `next_action.description` SHALL identify which nodes are blocked and why

---

### Requirement: Trimmed Engine Instructions

The Specwork engine SKILL.md SHALL be 60 lines or fewer after this change is implemented.

The trimmed SKILL.md MUST contain:
- Instruction to read `next_action` from every CLI response
- Instruction to execute `command` from `next_action`
- Instruction to use `on_pass` / `on_fail` for branching
- Instruction to check `suggest_to_user` when status is done
- Instruction that `context` reinforces the original change intent

The trimmed SKILL.md MUST NOT contain:
- State machine documentation duplicated from the CLI
- Node lifecycle step-by-step procedures
- Context assembly instructions (these belong in the node start next_action)

#### Scenario: agent drives workflow end-to-end via next_action alone

GIVEN an agent with only the trimmed SKILL.md (≤60 lines) loaded
WHEN the agent runs `specwork go <change-name>`
THEN the agent SHALL be able to complete the full workflow — from first ready node through all implementation, verification, and completion — by following only the `next_action` fields in CLI responses
WITHOUT needing to consult any additional state machine documentation
