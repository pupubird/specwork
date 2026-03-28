### Requirement: Micro-Spec Composition as Context Payload

The context assembler SHALL compose a `micro-spec.md` document for each node before it is spawned. This document MUST replace the output of `renderContext()` as the context payload injected into `node start --json`. The standalone `specwork context assemble` command MUST continue to work independently.

A micro-spec MUST contain exactly these sections in order, omitting any section whose source data is empty:

1. `## Objective` — the node's `description` field
2. `## Spec Scenarios` — sliced spec scenarios from `node.specs[]` references (if any)
3. `## Parent Decisions` — structured decisions and contracts from parent `L1-structured.json` files
4. `## Out of Scope` — sibling `scope[]` arrays as an exclusion list
5. `## Relevant Files` — snapshot file-tree filtered to entries matching `node.scope[]` globs
6. `## Success Criteria` — human-readable expansion of `node.validate[]` rules

#### Scenario: Micro-spec replaces renderContext output in node start response
Given a pending node with a completed parent that has `L1-structured.json`
When `specwork node start --json <change> <node>` is called
Then the JSON response `context` field contains a micro-spec document
And the document contains an `## Objective` section with the node description
And the document does NOT contain a raw `## Environment Snapshot` section header from `renderContext()`

#### Scenario: Micro-spec omits empty sections
Given a node with no `specs` field and no siblings and no completed parents
When the micro-spec is composed
Then the output contains only `## Objective` and `## Success Criteria`
And it does not contain empty section headers for `## Spec Scenarios`, `## Parent Decisions`, or `## Out of Scope`

#### Scenario: Micro-spec is ephemeral — not written to disk
Given a micro-spec is composed for a node
Then no `micro-spec.md` file is persisted to `.specwork/nodes/`
And the document is returned in-memory as a string

#### Scenario: Nodes without any new fields still get a micro-spec
Given a `GraphNode` with no `specs` field, no `scope` field, and parents with only `L1.md` (no `L1-structured.json`)
When the micro-spec is composed
Then the system MUST NOT throw an error
And the micro-spec contains at minimum the `## Objective` section
