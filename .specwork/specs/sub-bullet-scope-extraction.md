# Spec: Sub-Bullet Scope Extraction

## Overview

The graph generator SHALL extract file paths from indented sub-bullet lines below each task checkbox, not just the checkbox line itself. This ensures impl node scopes are populated when file paths appear in natural task formatting.

---

### Requirement: Sub-Bullet Line Capture

The `parseTasks` function SHALL capture indented lines (2+ leading spaces or tab) below each checkbox task as `subLines`. Collection SHALL stop when encountering a non-indented line, another checkbox (`- [ ]`), or a section header (`##`).

#### Scenario: Sub-bullets with file paths are captured
Given a tasks.md with:
```
- [ ] 1.1 Fix scope extraction
  - `src/core/graph-generator.ts`
  - `src/__tests__/core/graph-generator.test.ts`
```
When `parseTasks` processes this content
Then the resulting `ParsedTask` SHALL have `subLines` containing both indented lines
And `subLines` SHALL NOT be empty

#### Scenario: Sub-bullets stop at next checkbox
Given a tasks.md with:
```
- [ ] 1.1 Fix scope extraction
  - `src/core/graph-generator.ts`
- [ ] 1.2 Remove dead code
  - `src/core/graph-generator.ts`
```
When `parseTasks` processes this content
Then task 1.1 SHALL have `subLines` containing only the first indented line
And task 1.2 SHALL have `subLines` containing only the second indented line

#### Scenario: Sub-bullets stop at section header
Given a tasks.md with:
```
- [ ] 1.1 Fix scope extraction
  - `src/core/graph-generator.ts`
## 2. Next Section
```
When `parseTasks` processes this content
Then task 1.1 SHALL have `subLines` containing only the indented line
And the section header SHALL NOT appear in `subLines`

#### Scenario: Task with no sub-bullets
Given a tasks.md with:
```
- [ ] 1.1 Fix scope extraction in `src/core/graph-generator.ts`
```
When `parseTasks` processes this content
Then the resulting `ParsedTask` SHALL have an empty `subLines` array

---

### Requirement: Scope Extraction from Combined Text

When computing a node's scope, the graph generator SHALL pass the concatenation of `rawLine` and all `subLines` to `extractFilePaths`. File paths found in any of these lines SHALL be included in the node's `scope` array.

#### Scenario: File paths in sub-bullets populate scope
Given a task with rawLine `- [ ] 1.1 Fix scope extraction` and subLines containing `  - src/core/graph-generator.ts`
When the graph generator creates the impl node
Then the node's `scope` SHALL include `src/core/graph-generator.ts`

#### Scenario: File paths in both rawLine and sub-bullets are merged
Given a task with rawLine `- [ ] 1.1 Fix src/core/foo.ts` and subLines containing `  - src/core/bar.ts`
When the graph generator creates the impl node
Then the node's `scope` SHALL include both `src/core/foo.ts` and `src/core/bar.ts`

#### Scenario: Duplicate paths are deduplicated
Given a task with rawLine mentioning `src/core/foo.ts` and subLines also mentioning `src/core/foo.ts`
When the graph generator creates the impl node
Then the node's `scope` SHALL contain `src/core/foo.ts` exactly once

---

### Requirement: Dead Code Removal

The `generateGraph` function SHALL NOT read `proposal.md` or `design.md` for the sole purpose of building an `allContext` variable that is never used for scope extraction. If these reads serve no other purpose, they SHALL be removed.

#### Scenario: allContext variable is removed
Given the current `generateGraph` function builds `allContext` from tasks+proposal+design but never uses it
When this change is applied
Then the `allContext` variable SHALL be removed
And `proposalContent` and `designContent` reads SHALL be removed if unused elsewhere
And the function SHALL still read `tasks.md` for task parsing
