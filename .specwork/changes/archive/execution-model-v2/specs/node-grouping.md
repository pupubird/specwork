# Spec: Node Grouping for Shared-Agent Execution

## Overview

Related tasks from the same logical group SHALL be collapsed into a single graph node executed by one agent. The collapsed node carries a checklist of sub-tasks. One verification and one summarization run cover the entire group.

---

### Requirement: GraphNode Group Fields

A `GraphNode` SHALL support two optional fields for grouping:
- `group`: a string label identifying the group this node belongs to
- `sub_tasks`: a list of task description strings representing the checklist the agent executes

Both fields are optional. Their absence indicates a standard single-task node and SHALL NOT affect existing behavior.

#### Scenario: grouped node carries sub_tasks checklist

Given a graph node with `sub_tasks: ["Add type field", "Wire constructor", "Export interface"]`
When the agent is spawned for that node
Then the agent SHALL receive all three sub-task descriptions as a checklist
And the agent SHALL be expected to complete all three as part of one session

#### Scenario: node without sub_tasks is treated as single-task

Given a graph node with no `sub_tasks` field
When the node is executed
Then execution SHALL behave identically to the current single-task flow

---

### Requirement: Combined Scope for Group Nodes

A collapsed group node's `scope` SHALL be the union of all individual sub-task scopes.

#### Scenario: verification uses combined scope

Given a group node with `scope: ["src/types/config.ts", "src/types/graph.ts", "src/types/state.ts"]`
When the engine runs verification for that node
Then the scope check SHALL apply to all three files
And a change to any file outside that combined scope SHALL cause verification to fail

---

### Requirement: Per-Group Verification

For a collapsed group node, verification SHALL run once after all sub-tasks are complete. Verification covers the combined scope of the entire group.

#### Scenario: one verify call for the whole group

Given a group node with 3 sub-tasks
When the agent completes all 3 sub-tasks
Then exactly one verification run SHALL be triggered for the group node
And the verification SHALL validate the combined scope of all 3 sub-tasks

#### Scenario: group node verification failure triggers group retry

Given a group node where verification fails
And the node has retries remaining
When the node is retried
Then the entire group's agent SHALL be re-spawned
And all sub-tasks SHALL be attempted again
And the failed verification's check details SHALL be injected into the re-spawn context

---

### Requirement: Per-Group Summarization

For a collapsed group node, the summarizer SHALL run once after the group completes and produces a single coherent L0/L1/L2 that covers the full group.

The L1 summary SHALL capture:
- All exports, types, and interfaces produced by the group as a whole
- Cross-sub-task relationships (e.g., a helper added in sub-task 1 that is used in sub-task 2)
- Architectural decisions made during the group's execution

#### Scenario: group summarizer produces one L1 covering all sub-tasks

Given a group node with sub_tasks covering 3 source files
When the group node completes and the summarizer runs
Then one L1 file SHALL be written for the group node
And that L1 SHALL reference all files changed across all sub-tasks
And that L1 SHALL NOT be split into per-sub-task L1 files

#### Scenario: downstream nodes receive the group's unified L1

Given a group node has completed with a group-level L1
And a downstream node lists the group node as a dependency
When the downstream node's context is assembled
Then the downstream node SHALL receive the group's unified L1
And it SHALL NOT receive separate per-sub-task summaries

---

### Requirement: Group Opt-Out

An author SHALL be able to opt a specific node out of group collapsing so it executes as an isolated single-task node.

#### Scenario: opt-out node is not collapsed with its section peers

Given tasks.md has three tasks under the same `##` section header
And one task is annotated with the group opt-out marker
When the graph is generated
Then the two non-opted tasks SHALL be collapsed into one group node
And the opted-out task SHALL be a separate isolated node with no `group` field
