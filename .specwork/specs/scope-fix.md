### Requirement: Per-Task Scope Extraction

The graph generator SHALL extract scope paths from the individual task line only, not from a shared context blob shared across all nodes. Each impl node's scope SHALL reflect only the files mentioned in that task's description.

When `extractFilePaths` returns no results for a task line, the fallback scope SHALL be derived from the task's group name using a slug heuristic (e.g., group "Authentication Middleware" → `src/authentication-middleware/`), NOT the entire `src/` tree.

#### Scenario: Task line contains explicit file paths
Given a task line `- [ ] Update src/core/graph-generator.ts to fix scope extraction`
When the graph generator creates the impl node
Then the node's `scope` SHALL be `["src/core/graph-generator.ts"]`
And `allContext` SHALL NOT be scanned for additional paths

#### Scenario: Task line has no explicit paths — group fallback
Given a task with description "Fix scope extraction logic" in group "Graph Generator"
And the task line contains no file path patterns
When the graph generator creates the impl node
Then the node's `scope` SHALL be `["src/graph-generator/"]`
And the scope SHALL NOT be `["src/"]`

#### Scenario: Multiple impl nodes in same group have distinct scopes
Given two tasks in the same group, each mentioning different files
When the graph generator creates both impl nodes
Then each node's `scope` SHALL reflect only the files mentioned in its own task line
And the scopes SHALL NOT be identical unless the task lines mention identical files

---

### Requirement: Node Start SHA Tracking

When a node transitions to `in_progress` status, the system SHALL record the current git HEAD SHA as `start_sha` in the node's state. This SHA serves as the diff baseline for scope-check during verification.

`NodeState` SHALL include a `start_sha: string | null` field. It SHALL be `null` until the node first enters `in_progress`.

#### Scenario: start_sha recorded on node start
Given a node in `pending` status
When the node transitions to `in_progress`
Then `state.nodes[nodeId].start_sha` SHALL be set to the output of `git rev-parse HEAD`
And `start_sha` SHALL NOT be overwritten on subsequent retries if it is already set

#### Scenario: start_sha is null for fresh nodes
Given a newly initialized workflow state
When the state is created
Then every node's `start_sha` SHALL be `null`

#### Scenario: Non-git repository graceful fallback
Given a project directory that is not a git repository
When a node transitions to `in_progress`
Then `start_sha` SHALL remain `null`
And no error SHALL be thrown

---

### Requirement: Node-Baseline Scope Check

The `scope-check` validation rule SHALL compare only files changed since the node's `start_sha` against the node's declared `scope`. If `start_sha` is available, the diff command SHALL be `git diff --name-only <start_sha>`. If `start_sha` is `null`, the check SHALL fall back to `git diff --name-only` (current behavior).

This ensures that files modified by sibling nodes (which ran before `start_sha`) do not appear in the current node's diff and cannot cause false scope violations.

#### Scenario: Sibling node changes do not pollute scope check
Given node A modified `src/core/foo.ts` and is complete
And node B has `scope: ["src/core/bar.ts"]` and `start_sha` pointing to the SHA before A started
And node B modified only `src/core/bar.ts`
When scope-check runs for node B
Then the diff SHALL be computed as `git diff --name-only <start_sha>`
And `src/core/foo.ts` SHALL appear in the diff (it was changed before start_sha too)
But since `start_sha` is the SHA at the point node B started, only `src/core/bar.ts` changes appear after it
And the check SHALL return PASS

#### Scenario: start_sha baseline isolates only this node's changes
Given `start_sha` = SHA of commit C1
And since C1, only `src/core/bar.ts` was modified by the current node
When scope-check runs with `scope: ["src/core/bar.ts"]`
Then `git diff --name-only C1` returns only `src/core/bar.ts`
And the check SHALL return PASS

#### Scenario: Fallback when start_sha is null
Given a node with `start_sha: null`
When scope-check runs
Then it SHALL fall back to `git diff --name-only` (no base SHA)
And behavior SHALL be identical to the current implementation

#### Scenario: File outside scope fails even with baseline
Given `start_sha` is set and `git diff --name-only <start_sha>` returns `src/wrong/file.ts`
And the node's `scope` is `["src/correct/"]`
When scope-check runs
Then the check SHALL return FAIL
And the detail SHALL list `src/wrong/file.ts` as out-of-scope
