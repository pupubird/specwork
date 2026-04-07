# Spec: Scoped tests-pass Validation

## Overview

The graph generator SHALL populate the `tests-pass` validation rule's `args.file` field for impl nodes by deriving test file paths from the node's source scope. This ensures only relevant tests are run during node validation, preventing false failures from unrelated pre-existing test failures.

---

### Requirement: Test File Derivation from Scope

The graph generator SHALL include a `deriveTestFiles` function that maps source file paths to their corresponding test file paths using the project's test directory convention: `src/<path>/<name>.ts` → `src/__tests__/<path>/<name>.test.ts`.

#### Scenario: Single source file maps to single test file
Given an impl node with scope `["src/core/graph-generator.ts"]`
When `deriveTestFiles` is called with the scope
Then it SHALL return `["src/__tests__/core/graph-generator.test.ts"]`

#### Scenario: Multiple source files map to multiple test files
Given an impl node with scope `["src/core/graph-generator.ts", "src/core/graph-validator.ts"]`
When `deriveTestFiles` is called with the scope
Then it SHALL return `["src/__tests__/core/graph-generator.test.ts", "src/__tests__/core/graph-validator.test.ts"]`

#### Scenario: Test files in scope are excluded from mapping
Given an impl node with scope `["src/__tests__/core/foo.test.ts", "src/core/foo.ts"]`
When `deriveTestFiles` is called with the scope
Then it SHALL return `["src/__tests__/core/foo.test.ts"]`
And it SHALL NOT attempt to double-map test file paths

#### Scenario: Non-.ts files are excluded from mapping
Given an impl node with scope `["src/core/graph-generator.ts", "src/config.yaml"]`
When `deriveTestFiles` is called with the scope
Then it SHALL only return the mapping for the `.ts` file

#### Scenario: Directory scope paths are excluded from mapping
Given an impl node with scope `["src/core/"]`
When `deriveTestFiles` is called with the scope
Then it SHALL return an empty array

---

### Requirement: tests-pass Rule Population

When generating impl nodes, the graph generator SHALL call `deriveTestFiles` on the node's scope and populate the `tests-pass` validation rule with `args.file` containing the derived test file paths joined by space.

#### Scenario: Impl node gets scoped tests-pass rule
Given an impl node with scope `["src/core/verification.ts"]`
When the graph generator creates the node's validation rules
Then the `tests-pass` rule SHALL have `args.file` set to `"src/__tests__/core/verification.test.ts"`

#### Scenario: Impl node with no derivable test files gets unscoped tests-pass
Given an impl node with scope `["src/types/graph.ts"]` where `deriveTestFiles` returns empty
When the graph generator creates the node's validation rules
Then the `tests-pass` rule SHALL have no `args` field
And the verifier SHALL fall back to running the full test suite

#### Scenario: Grouped impl node derives tests from union scope
Given a grouped impl node with scope `["src/core/graph-generator.ts", "src/core/graph-validator.ts"]`
When the graph generator creates the node's validation rules
Then the `tests-pass` rule SHALL have `args.file` containing both derived test paths
