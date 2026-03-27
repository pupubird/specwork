### Requirement: Completion Guard

Before archiving, the system SHALL verify that all graph nodes for the change are in a terminal state and none are in a failed or pending state.

#### Scenario: All nodes complete — archive proceeds
Given a change where every node in `state.yaml` has status `complete` or `skipped`
When the user runs `specwork archive <change>`
Then the archive operation SHALL proceed without error

#### Scenario: Pending nodes present — archive blocked
Given a change where one or more nodes in `state.yaml` have status `pending` or `in_progress`
When the user runs `specwork archive <change>`
Then the system SHALL exit with an error naming the blocking nodes
And the archive directory SHALL NOT be created

#### Scenario: Failed nodes present — archive blocked
Given a change where one or more nodes in `state.yaml` have status `failed` or `escalated`
When the user runs `specwork archive <change>`
Then the system SHALL exit with an error naming the failed nodes
And the archive directory SHALL NOT be created

#### Scenario: No graph state — fall back to tasks.md guard
Given a change with no `state.yaml` (workflow never graphed)
When the user runs `specwork archive <change>`
Then the system SHALL fall back to checking `tasks.md` for unchecked items
And SHALL block if any unchecked items remain

#### Scenario: --force bypasses node-status guard
Given a change with failed nodes
When the user runs `specwork archive <change> --force`
Then the system SHALL skip the node-status guard and proceed with archival
And the CLI output SHALL warn that archival was forced

---

### Requirement: Archive Directory Move

The system SHALL copy the change directory to `.specwork/changes/archive/<change>/` and remove the originals on success.

#### Scenario: Change moved to archive
Given a valid change directory at `.specwork/changes/<change>/`
When archival completes successfully
Then all files from the change directory SHALL be present in `.specwork/changes/archive/<change>/`
And the original `.specwork/changes/<change>/` directory SHALL be removed
And `.specwork/graph/<change>/` SHALL be removed
And `.specwork/nodes/<change>/` SHALL be removed

#### Scenario: Archive destination already exists — error
Given an archive entry already exists at `.specwork/changes/archive/<change>/`
When the user runs `specwork archive <change>`
Then the system SHALL exit with an error indicating the change is already archived
And no files SHALL be moved or deleted

---

### Requirement: .specwork.yaml Status Update

The archived copy's `.specwork.yaml` SHALL have its `status` field set to `archived`.

#### Scenario: Status written to archive copy
Given a change with `.specwork.yaml` containing `status: active`
When archival completes
Then the `.specwork.yaml` in `.specwork/changes/archive/<change>/` SHALL have `status: archived`
And the `archived_at` field SHALL be set to the current ISO date string

---

### Requirement: summary.md Generation

The system SHALL generate a `summary.md` file in the archive directory that consolidates the change's node timeline, verification results, and description.

#### Scenario: summary.md created in archive
Given a change with L0 context files in `.specwork/nodes/<change>/`
When archival completes
Then `.specwork/changes/archive/<change>/summary.md` SHALL exist
And SHALL contain a node timeline section with L0 headlines for each node
And SHALL contain a verification summary table if any nodes recorded verdicts

#### Scenario: summary.md satisfies doctor archive check
Given an archive directory containing `summary.md`, `proposal.md`, `design.md`, `tasks.md`, and `.specwork.yaml` with `status: archived`
When `specwork doctor` checks archives
Then the archive integrity check SHALL pass

---

### Requirement: Spec Promotion

The system SHALL copy all spec files from `.specwork/changes/<change>/specs/` into `.specwork/specs/`, overwriting any existing files with the same name.

#### Scenario: Specs promoted to source-of-truth
Given a change with `specs/my-feature.md` in its change directory
When archival completes
Then `.specwork/specs/my-feature.md` SHALL contain the promoted content
And the CLI output SHALL list each spec file that was promoted

#### Scenario: No specs directory — promotion skipped silently
Given a change with no `specs/` subdirectory
When archival completes
Then the system SHALL complete without error
And the CLI output SHALL indicate zero specs promoted

---

### Requirement: Graph and Nodes Cleanup

The system SHALL remove the runtime artifacts for the change after successful archival.

#### Scenario: Runtime directories removed
Given a completed archive operation
When all copy operations succeeded
Then `.specwork/graph/<change>/` SHALL not exist
And `.specwork/nodes/<change>/` SHALL not exist
And the original `.specwork/changes/<change>/` SHALL not exist

#### Scenario: Missing runtime directories tolerated
Given a change where `.specwork/nodes/<change>/` does not exist (workflow never ran)
When archival completes
Then the system SHALL not error on the missing directory
And SHALL still complete the archive

---

### Requirement: CLI Output

The system SHALL produce human-readable confirmation output and support `--json` mode for agent consumption.

#### Scenario: Human-readable success output
Given archival completes successfully
When the user did not pass `--json`
Then the CLI SHALL print the archive destination path
And list the spec files promoted (or "none")
And confirm cleanup of graph/nodes directories

#### Scenario: JSON mode output
Given archival completes successfully
When the user passes `--json`
Then the CLI SHALL emit a single JSON object with fields: `change`, `archive_path`, `specs_promoted` (array), `nodes_cleaned` (boolean), `forced` (boolean)

#### Scenario: Error output
Given archival fails (e.g., pending nodes, destination exists)
When the error is encountered
Then the system SHALL print the error to stderr and exit with code 1
And the archive directory SHALL be left in a clean state (no partial copy)
