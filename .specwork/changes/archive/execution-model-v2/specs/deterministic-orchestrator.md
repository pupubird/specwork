# Spec: Deterministic Orchestrator Loop

## Overview

The Specwork lead agent SHALL operate from a (state, event) → command lookup table. The engine CLI SHALL return exact executable commands in `next_action`. The lead agent SHALL pattern-match the table and execute commands verbatim — no prose interpretation, no inferred steps.

This spec amends `go-next-action.md` to require that `next_action.command` always be an exact CLI command string or a defined symbolic action (`team:spawn`, `wait`, `escalate`, `suggest`). Prose workflow instructions SHALL NOT appear in `next_action.command`.

---

### Requirement: Exact Commands in next_action

Every `next_action.command` field SHALL be either:
1. A complete, executable `specwork` CLI command string with all required arguments filled in, OR
2. One of the defined symbolic actions: `team:spawn`, `wait`, `escalate`, `suggest`

`next_action.command` SHALL NOT be a prose description of what to do.

#### Scenario: go:ready returns exact node start commands via ready_queue

Given a change has 3 ready nodes: `impl-1`, `impl-2`, `impl-3`
When the engine runs `specwork go <change> --json`
Then the response SHALL include a `ready_queue` array containing all 3 node IDs
And `next_action.command` SHALL equal `"team:spawn"`
And the lead agent SHALL be able to construct the exact start command for each node from `ready_queue` alone

#### Scenario: node:complete response contains exact next command

Given a node has just been completed
When the engine returns the `node:complete` response
Then `next_action.command` SHALL be the exact string `specwork go <change-name> --json` with the change name filled in
And the lead agent SHALL execute that string verbatim

#### Scenario: node:verify:pass response contains exact complete command

Given verification has passed for a node
When the engine returns the `node:verify:pass` response
Then `next_action.on_pass` SHALL be a complete `specwork node complete <change> <node-id>` command
And no additional interpretation SHALL be required to execute it

---

### Requirement: State Machine Table as Lead Instructions

The Specwork engine SKILL.md SHALL be structured as a state transition table.

The table SHALL have three columns: **CLI Response Status**, **Event/Condition**, **Your Next Command**.

Each row SHALL map one (status, condition) pair to exactly one command.

The SKILL.md SHALL NOT contain:
- Numbered step-by-step procedures
- English prose describing what the agent should "think about" or "consider"
- Workflow diagrams or narrative explanations of the lifecycle

#### Scenario: lead agent follows table without external documentation

Given the SKILL.md contains only the state machine table and a one-paragraph preamble
When the lead agent receives any `next_action` response from the CLI
Then the lead agent SHALL be able to determine the next command by looking up the response status in the table
And the agent SHALL NOT need to reference any other documentation to proceed

#### Scenario: unknown status causes escalation to user

Given the lead agent receives a `next_action` response with a status not in the table
When the agent processes the response
Then the agent SHALL escalate to the user with the unrecognized status
And the agent SHALL NOT guess at the next step

---

### Requirement: No Prose Interpretation in Orchestration

The lead agent's orchestration decisions SHALL be fully determined by the `next_action` fields in CLI responses. The lead agent SHALL NOT make orchestration decisions based on its own interpretation of workflow intent.

This means:
- The agent SHALL NOT decide to skip verification because "the change looks trivial"
- The agent SHALL NOT re-order nodes because it "thinks" a different order is better
- The agent SHALL NOT combine or split steps beyond what the state table specifies

#### Scenario: lead does not skip verification for any node

Given any node completes — regardless of size, type, or perceived complexity
When the agent processes the completion
Then the agent SHALL run `specwork node verify` before marking the node complete
And the state table row for `node:start` SHALL include verification as the mandatory next step

#### Scenario: lead executes on_pass and on_fail as given

Given `next_action.on_pass` is `"specwork node complete exec-model-v2 impl-1 --json"`
When verification passes
Then the lead agent SHALL execute that exact string
And SHALL NOT modify, substitute, or abbreviate the command
