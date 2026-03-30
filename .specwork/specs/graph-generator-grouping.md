# Spec: Graph Generator Auto-grouping

## Overview

The graph generator SHALL automatically collapse tasks from the same `tasks.md` section into a single graph node. The section header (`## N. Name`) determines the group. Authors may opt individual tasks out of collapsing with an explicit annotation.

---

### Requirement: Auto-group from Section Headers

When generating a graph from `tasks.md`, tasks under the same `## N. Name` section header SHALL be collapsed into one `GraphNode`.

The collapsed node SHALL have:
- An `id` derived from the section (e.g., `impl-{groupIndex}`)
- A `sub_tasks` array containing the description of each task in the section
- A `scope` equal to the union of all per-task scopes in the section
- A `group` field set to the slugified section header name
- `deps` wired to the same rules as the current single-task first-in-group dependency (depends on `write-tests`, or on the previous group's collapsed node if an explicit ordering exists)

#### Scenario: three tasks in one section collapse to one node

Given `tasks.md` has a section `## 1. Type System and Config` with 3 checkbox tasks
When the graph is generated
Then the output graph SHALL contain exactly one node for that section (not 3)
And that node's `sub_tasks` SHALL contain all 3 task descriptions as strings
And that node's `scope` SHALL be the union of paths mentioned across all 3 tasks

#### Scenario: tasks in different sections become separate nodes

Given `tasks.md` has sections `## 1. Type System` and `## 2. Wave Execution`
When the graph is generated
Then the graph SHALL contain one collapsed node for section 1 and one for section 2
And the section 2 node's `deps` SHALL include the section 1 node

#### Scenario: single-task section emits a normal node (no sub_tasks)

Given `tasks.md` has a section with exactly one checkbox task
When the graph is generated
Then the graph SHALL contain one node for that section
And the node's `sub_tasks` field SHALL be omitted or empty

---

### Requirement: group: null Opt-Out

An individual task SHALL be isolatable from its section's group by annotating it with a group opt-out marker in `tasks.md`.

An opted-out task SHALL become its own `GraphNode` with no `group` field and no `sub_tasks`.

The remaining tasks in the same section SHALL still be collapsed together (minus the opted-out task).

#### Scenario: opted-out task becomes its own node

Given a section with 3 tasks where the second task has the group opt-out annotation
When the graph is generated
Then the output SHALL contain 2 nodes for that section:
  - One collapsed node for tasks 1 and 3 (with `sub_tasks` containing both descriptions)
  - One isolated node for task 2 (no `group`, no `sub_tasks`)

#### Scenario: opted-out node has correct dependencies

Given an opted-out task is the first task in a section
When the graph is generated
Then the opted-out node SHALL depend on `write-tests` (or the appropriate upstream group)
And the collapsed node for the remaining tasks SHALL also depend on `write-tests`

---

### Requirement: group Field on Generated Nodes

Every collapsed group node generated from a `## N. Name` section SHALL have a `group` field set to the slugified section name.

Single-task isolated nodes (whether from single-task sections or from opt-outs) SHALL have no `group` field.

#### Scenario: group field matches slugified header

Given a section header `## 2. Wave-based Execution`
When the graph is generated
Then the collapsed node for that section SHALL have `group: "wave-based-execution"`

#### Scenario: existing graphs without group field continue to work

Given a graph YAML that was generated before this change (no `group` or `sub_tasks` fields on any node)
When `specwork go` is run against that graph
Then the workflow SHALL execute successfully
And all nodes SHALL be treated as single-task nodes

---

### Requirement: Backward-compatible Graph Schema

The `group` and `sub_tasks` fields on `GraphNode` SHALL be optional. Their absence SHALL not cause errors in any part of the engine, CLI, or context assembly.

#### Scenario: missing group field does not affect execution

Given a node with no `group` field
When the engine processes that node in any operation (start, verify, complete, summarize)
Then no error SHALL occur
And the node SHALL be treated equivalently to a node with `group: undefined`
