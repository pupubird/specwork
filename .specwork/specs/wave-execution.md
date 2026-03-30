# Spec: Wave-based Execution with max_concurrent

## Overview

Specwork SHALL limit the number of nodes executing simultaneously in any one wave. A wave is a batch of at most `max_concurrent` ready nodes dispatched together. State tracks the current wave number. Waves auto-continue on success and pause only on failure, regression, or human gate.

---

### Requirement: max_concurrent Configuration

The Specwork configuration SHALL support a `max_concurrent` field under `execution` that limits how many nodes run in each wave.

When `max_concurrent` is not set in config, the system SHALL default to 5.

#### Scenario: max_concurrent caps the wave size

Given a graph with 10 nodes all ready simultaneously
And `max_concurrent` is configured to 3
When the engine dispatches the next wave
Then exactly 3 nodes SHALL be selected for execution
And the remaining 7 nodes SHALL remain in `pending` state

#### Scenario: default max_concurrent applies when not configured

Given a graph with 8 ready nodes
And no `max_concurrent` is set in config
When the engine dispatches the next wave
Then exactly 5 nodes SHALL be selected for execution

#### Scenario: wave smaller than max_concurrent uses all ready nodes

Given a graph with 2 ready nodes
And `max_concurrent` is configured to 5
When the engine dispatches the next wave
Then both 2 nodes SHALL be selected for execution

---

### Requirement: Wave Tracking in State

The workflow state SHALL track the current wave number.

The wave number SHALL start at 0 and increment by 1 each time a new wave is dispatched.

#### Scenario: wave number increments on each dispatch

Given a workflow with `current_wave: 0`
When the engine dispatches a batch of ready nodes
Then `current_wave` in state SHALL be incremented to 1

#### Scenario: wave number is initialized to 0 for new workflows

Given a new workflow is initialized from a graph
When the initial state is created
Then `current_wave` SHALL equal 0

---

### Requirement: Wave Gate Auto-Continue

Waves SHALL auto-continue after a clean wave completes. A wave is clean when all nodes in the wave completed successfully with no regressions.

The engine SHALL pause between waves only when:
- One or more nodes in the completed wave failed or were escalated, OR
- One or more nodes in the completed wave detected regressions during verification, OR
- One or more nodes in the completed wave had `gate: human`

#### Scenario: clean wave continues automatically

Given a wave of 3 nodes all completed with `verdict: PASS` and no regressions
And none of the nodes had `gate: human`
When the wave finishes
Then the engine SHALL automatically dispatch the next wave
And no user confirmation SHALL be required

#### Scenario: wave with failure pauses for user

Given a wave where one node failed after exhausting retries
When the wave finishes
Then the engine SHALL pause execution
And the engine SHALL present the failed node details to the user
And execution SHALL NOT continue until the user provides direction

#### Scenario: wave with regression pauses for user

Given a wave where verification detected a regression (a check that previously passed now fails)
When the wave finishes
Then the engine SHALL pause execution
And the engine SHALL report which checks regressed and on which node
And execution SHALL NOT continue until the user provides direction

#### Scenario: wave containing a gate:human node pauses for approval

Given a wave that includes a node with `gate: human`
When that node's work is complete
Then the engine SHALL present the node's output to the user
And execution SHALL NOT advance past that node until the user approves or rejects
