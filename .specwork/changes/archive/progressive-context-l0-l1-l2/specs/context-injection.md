### Requirement: Context Auto-Injection on Node Start

When a node is started via the CLI in JSON mode, the response SHALL include the fully assembled context bundle for that node. The context SHALL contain the environment snapshot, L0 headlines for all previously completed nodes, L1 content for direct parent nodes, any declared input files, and the node's prompt. This eliminates the need for a separate context assembly step before spawning the subagent.

The `specwork context assemble` command MUST continue to work independently for manual use and EXPAND flows. Context injection is additive — it does not replace the standalone command.

#### Scenario: Node start response includes context
Given a workflow with one completed `snapshot` node that has an L0 artifact
When `specwork node start --json <change> <node>` is called for a pending node
Then the JSON response includes a non-empty `context` field
And the `context` field contains the snapshot section
And the `context` field contains the completed node's L0 headline

#### Scenario: Context includes parent L1 when available
Given a workflow where the parent node has an L1.md artifact
When `specwork node start --json <change> <node>` is called
Then the JSON response `context` field includes the parent's L1 content under a "Parent Node Context" section

#### Scenario: Node start without --json does not include raw context dump
Given a workflow with completed nodes
When `specwork node start <change> <node>` is called without `--json`
Then the human-readable table output is displayed without a raw context dump
And the command exits with code 0

#### Scenario: Context injection succeeds when no prior nodes are complete
Given a workflow where no nodes have completed yet
When `specwork node start --json <change> <node>` is called for the first node
Then the JSON response includes a `context` field
And the field contains the snapshot section
And the L0 and L1 sections are absent or empty
