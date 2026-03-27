### Requirement: Archive Produces digest.md Instead of summary.md

When archiving a completed change, the engine SHALL produce a `digest.md` file instead of `summary.md`. The digest MUST consolidate: change metadata (name, archived date, node count, final status), an L0 timeline listing all nodes with their headlines, L1 details for nodes that have an `L1.md` artifact, and a verification summary table showing verdict and check count per node. L2 content SHALL NOT be included in the digest (full diffs are preserved in git history).

The digest MUST be structured for future agent reads — compact, decision-focused, with clear section headers. It SHOULD enable an agent to quickly understand what business logic was added or changed without reading source code.

#### Scenario: Archive writes digest.md not summary.md
Given a completed change with verified nodes that have L0 and L1 artifacts
When `specwork archive <change>` is called
Then the archive directory contains `digest.md`
And the archive directory does NOT contain `summary.md`

#### Scenario: Digest contains L0 timeline section
Given nodes with L0.md artifacts containing headlines
When `specwork archive <change>` is called
Then `digest.md` contains a "Node Timeline" section
And each node with an L0.md appears as a list item with its nodeId and headline

#### Scenario: Digest contains L1 details for nodes with L1 artifacts
Given a node with an L1.md artifact containing files changed and decisions
When `specwork archive <change>` is called
Then `digest.md` contains a "Node Details" section
And that node's L1 content appears under its nodeId subsection

#### Scenario: Digest omits L1 section for nodes without L1 artifacts
Given a `snapshot` node with only an L0.md (no L1.md)
When `specwork archive <change>` is called
Then the snapshot node appears in the L0 timeline
And the snapshot node does NOT appear as a subsection in the Node Details section

#### Scenario: Digest contains verification summary table
Given nodes with verify.md artifacts recording PASS verdicts
When `specwork archive <change>` is called
Then `digest.md` contains a "Verification Summary" table
And the table lists each verified node with its verdict

#### Scenario: Digest excludes L2 content
Given nodes with L2.md artifacts containing full diffs
When `specwork archive <change>` is called
Then `digest.md` does NOT contain the full diff content from any L2.md file
