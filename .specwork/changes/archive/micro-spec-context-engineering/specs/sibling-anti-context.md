### Requirement: Sibling Anti-Context via getSiblings

The graph-walker SHALL expose a `getSiblings(graph, nodeId)` function that returns all node IDs which share at least one common parent with the given node but are not the node itself and are not ancestors of the node.

The context assembler SHALL collect the `scope[]` arrays of all sibling nodes and render them as an `## Out of Scope` section in the micro-spec. This section informs the subagent of file globs owned by concurrent nodes.

#### Scenario: getSiblings returns nodes with a shared parent
Given a graph where `write-tests` depends on `snapshot`, and `impl-types` also depends on `snapshot`
When `getSiblings(graph, "impl-types")` is called
Then the result contains `"write-tests"`
And it does not contain `"snapshot"` (parent) or `"impl-types"` itself

#### Scenario: getSiblings returns empty for a node with no siblings
Given a node whose parent has no other dependents
When `getSiblings(graph, nodeId)` is called
Then the result is an empty array

#### Scenario: getSiblings excludes ancestor nodes
Given a graph where node C depends on B, and B depends on A
When `getSiblings(graph, "C")` is called
Then node A is not in the result (it is an ancestor, not a sibling)

#### Scenario: Out-of-scope section lists sibling scope globs
Given a node `impl-service` with sibling `impl-types` whose scope is `["src/types.ts"]`
When the micro-spec is composed for `impl-service`
Then the `## Out of Scope` section contains `src/types.ts`

#### Scenario: Out-of-scope section omitted when siblings have no scope
Given all sibling nodes have an empty `scope: []` array
When the micro-spec is composed
Then the `## Out of Scope` section is omitted entirely

#### Scenario: Out-of-scope section omitted when node has no siblings
Given a node with no sibling nodes
When the micro-spec is composed
Then the `## Out of Scope` section is not present in the output
