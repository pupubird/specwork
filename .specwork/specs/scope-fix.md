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

When a node transitions to `in_progress` status, the system SHALL record the current git HEAD SHA as `start_sha` in the node's state. This SHA serves as the diff baseline for tsc-check during verification.

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

