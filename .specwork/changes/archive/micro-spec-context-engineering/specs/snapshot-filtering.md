### Requirement: Snapshot File-Tree Filtering by Node Scope

When a node has a non-empty `scope: string[]` array, the assembler SHALL filter the snapshot's file-tree section to include only entries matching at least one of the node's scope globs. Lines outside the file tree (headings, dependency tables, export listings) are preserved unchanged.

The filtered snapshot MUST be used in the `## Relevant Files` micro-spec section. No additional I/O is performed — filtering operates on the already-loaded snapshot string.

#### Scenario: File-tree filtered to scope-matching entries
Given a snapshot containing a file tree with entries `src/core/context-assembler.ts`, `src/cli/context.ts`, `src/types/graph.ts`
And a node with `scope: ["src/core/**"]`
When the snapshot is filtered
Then the result includes `src/core/context-assembler.ts`
And the result excludes `src/cli/context.ts` and `src/types/graph.ts`

#### Scenario: Multiple scope globs produce a union of matches
Given a node with `scope: ["src/core/**", "src/types/**"]`
When the snapshot is filtered
Then all entries matching either glob are included
And entries matching neither are excluded

#### Scenario: Full snapshot used when node has no scope
Given a node with `scope: []` (empty array)
When the micro-spec is composed
Then the `## Relevant Files` section contains the full snapshot content unfiltered

#### Scenario: Non-file-tree lines preserved during filtering
Given a snapshot with a `## Dependencies` section listing package versions
And a node with a non-empty `scope` array
When the snapshot is filtered
Then the `## Dependencies` section appears unchanged in the output
And only the file-tree lines are subject to filtering

#### Scenario: Relevant Files section omitted when filtered result is empty
Given a node with `scope: ["src/nonexistent/**"]` that matches no snapshot entries
When the micro-spec is composed
Then the `## Relevant Files` section is omitted from the output
