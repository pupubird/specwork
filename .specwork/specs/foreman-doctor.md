# Specwork Doctor

### Requirement: Comprehensive Artifact Validation

The system SHALL validate all Specwork artifact categories (config, specs, archives, changes, graphs, templates) when `specwork doctor` is run without arguments.

#### Scenario: Full project health check
- **GIVEN** a Specwork project with `.specwork/` initialized
- **WHEN** the user runs `specwork doctor`
- **THEN** the system SHALL check config, specs, archives, changes, graphs, templates, and cross-references
- **AND** report results grouped by category with ✓/✗ symbols and summary counts

#### Scenario: Scoped health check
- **GIVEN** a Specwork project with an active change named "my-feature"
- **WHEN** the user runs `specwork doctor my-feature`
- **THEN** the system SHALL only validate artifacts related to "my-feature" (change dir, graph, nodes)
- **AND** still validate global artifacts (config, specs, templates)

### Requirement: Spec Format Linting

The system SHALL validate spec files for correct heading levels, keywords, and scenario structure.

#### Scenario: Valid spec passes
- **GIVEN** a spec file using `### Requirement:` (3#) headers and `#### Scenario:` (4#) headers with SHALL/SHOULD/MAY keywords and GIVEN/WHEN/THEN structure
- **WHEN** the doctor checks specs
- **THEN** the check SHALL pass

#### Scenario: Scenario with wrong heading level
- **GIVEN** a spec file where a scenario uses `### Scenario:` (3#) instead of `#### Scenario:` (4#)
- **WHEN** the doctor checks specs
- **THEN** the check SHALL fail with an error indicating the line number and expected heading level
- **AND** the error SHALL be marked as fixable

#### Scenario: Missing keywords
- **GIVEN** a spec file with a scenario that lacks GIVEN/WHEN/THEN structure
- **WHEN** the doctor checks specs
- **THEN** the check SHALL report a warning

### Requirement: Archive Integrity Validation

The system SHALL validate that archived changes are in compact format with required files.

#### Scenario: Valid archive
- **GIVEN** an archive directory with `.specwork.yaml` (status: archived), `proposal.md`, `design.md`, `tasks.md`, and `summary.md`
- **WHEN** the doctor checks archives
- **THEN** the check SHALL pass

#### Scenario: Archive with loose artifacts
- **GIVEN** an archive directory containing `graph.yaml`, `state.yaml`, or a `nodes/` subdirectory
- **WHEN** the doctor checks archives
- **THEN** the check SHALL fail with a warning that the archive is not in compact format
- **AND** the warning SHALL be marked as fixable (can be groomed)

#### Scenario: Archive missing summary
- **GIVEN** an archive directory without `summary.md`
- **WHEN** the doctor checks archives
- **THEN** the check SHALL fail with an error

### Requirement: Config Validation

The system SHALL validate that `.specwork/config.yaml` exists and contains required sections.

#### Scenario: Valid config
- **GIVEN** a `.specwork/config.yaml` with models, execution, spec, and graph sections
- **WHEN** the doctor checks config
- **THEN** the check SHALL pass

#### Scenario: Missing config
- **GIVEN** no `.specwork/config.yaml` file exists
- **WHEN** the doctor checks config
- **THEN** the check SHALL fail with an error

#### Scenario: Missing required section
- **GIVEN** a `.specwork/config.yaml` missing the `execution` section
- **WHEN** the doctor checks config
- **THEN** the check SHALL fail with an error naming the missing section

### Requirement: Auto-Fix Support

The system SHALL support a `--fix` flag that applies safe, reversible auto-repairs to fixable issues.

#### Scenario: Fix applied
- **GIVEN** a doctor report with fixable issues (e.g., scenario heading level, missing template)
- **WHEN** the user runs `specwork doctor --fix`
- **THEN** the system SHALL apply all fixable repairs
- **AND** report which fixes were applied

#### Scenario: No fixes needed
- **GIVEN** a doctor report with no fixable issues
- **WHEN** the user runs `specwork doctor --fix`
- **THEN** the system SHALL report "No fixable issues found"

### Requirement: Cross-Reference Validation

The system SHALL validate that references between artifacts are consistent.

#### Scenario: Graph node IDs match node directories
- **GIVEN** a graph with nodes ["snapshot", "write-tests", "impl-auth"]
- **WHEN** node directories exist for all three in `.specwork/nodes/<change>/`
- **THEN** the cross-ref check SHALL pass

#### Scenario: Orphaned node directory
- **GIVEN** a node directory `.specwork/nodes/<change>/orphan-node/` that is not in graph.yaml
- **WHEN** the doctor checks cross-references
- **THEN** the check SHALL report a warning about the orphaned directory

### Requirement: Exit Code Semantics

The system SHALL exit with code 0 when all checks pass (warnings allowed) and code 1 when any errors exist.

#### Scenario: All pass
- **GIVEN** all doctor checks pass
- **WHEN** the command exits
- **THEN** the exit code SHALL be 0

#### Scenario: Errors present
- **GIVEN** one or more doctor checks report errors
- **WHEN** the command exits
- **THEN** the exit code SHALL be 1
