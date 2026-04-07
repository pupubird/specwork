# Spec: Scope Overlap Detection

## Overview

The graph validator SHALL detect and warn when two or more LLM nodes have overlapping scope entries. Overlap detection is advisory (warning, not error) and helps authors identify potential file ownership conflicts before running `specwork go`.

---

### Requirement: Exact Scope Overlap Warning

When two or more LLM nodes declare the same path in their `scope` arrays, the graph validator SHALL emit a warning naming the overlapping path and the nodes that claim it.

#### Scenario: Two nodes share the same scope path
Given node `impl-1` with scope `["src/core/foo.ts"]`
And node `impl-2` with scope `["src/core/foo.ts", "src/core/bar.ts"]`
When `validateGraph` runs
Then it SHALL emit a warning: `Scope overlap: "src/core/foo.ts" claimed by nodes: impl-1, impl-2`
And `valid` SHALL remain `true`

#### Scenario: No overlap between nodes
Given node `impl-1` with scope `["src/core/foo.ts"]`
And node `impl-2` with scope `["src/core/bar.ts"]`
When `validateGraph` runs
Then it SHALL NOT emit any scope overlap warnings

#### Scenario: Three nodes share the same path
Given nodes `impl-1`, `impl-2`, and `impl-3` all with `"src/types/graph.ts"` in their scope
When `validateGraph` runs
Then it SHALL emit a warning naming all three nodes

---

### Requirement: Prefix Containment Warning

When one LLM node's scope path is a prefix of another LLM node's scope path (directory containment), the graph validator SHALL emit a warning.

#### Scenario: Directory scope contains file scope
Given node `impl-1` with scope `["src/core/"]`
And node `impl-2` with scope `["src/core/foo.ts"]`
When `validateGraph` runs
Then it SHALL emit a containment warning for `src/core/` and `src/core/foo.ts`

#### Scenario: Two non-overlapping directories
Given node `impl-1` with scope `["src/core/"]`
And node `impl-2` with scope `["src/utils/"]`
When `validateGraph` runs
Then it SHALL NOT emit any containment warnings

---

### Requirement: Non-LLM Nodes Excluded

Scope overlap detection SHALL only consider nodes with `type: 'llm'`. Deterministic and human nodes SHALL be excluded from overlap checks.

#### Scenario: Deterministic node scope ignored
Given LLM node `impl-1` with scope `["src/core/foo.ts"]`
And deterministic node `integration` with scope `["src/core/foo.ts"]`
When `validateGraph` runs
Then it SHALL NOT emit any scope overlap warnings

---

### Requirement: Warning Severity

Scope overlap warnings SHALL NOT cause `validateGraph` to return `valid: false`. They are advisory only. The warnings appear in the `warnings` array of `ValidationResult`.

#### Scenario: Graph with overlapping scopes is still valid
Given a graph with two impl nodes that have overlapping scopes
And no other validation errors
When `validateGraph` runs
Then `valid` SHALL be `true`
And `warnings` SHALL contain the overlap warning
And `errors` SHALL be empty
