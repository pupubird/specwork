# Spec: Update Command

## ADDED

### Requirement: Version Tracking

The system SHALL store a `specwork_version` field in `.specwork/config.yaml` containing the semver string of the specwork version that last wrote the project files.

The `specwork init` command SHALL write the current package version as `specwork_version` when creating a new project.

The `specwork update` command SHALL update `specwork_version` to the current package version upon successful completion.

#### Scenario: Fresh init sets version
- Given a directory with no `.specwork/` directory
- When the user runs `specwork init`
- Then `.specwork/config.yaml` SHALL contain a `specwork_version` field matching the installed package version

#### Scenario: Update bumps version
- Given a project with `specwork_version: "0.1.0"` and installed specwork version `0.2.0`
- When the user runs `specwork update`
- Then `specwork_version` in config.yaml SHALL be `"0.2.0"`

#### Scenario: Already up to date
- Given a project where `specwork_version` matches the installed package version
- When the user runs `specwork update`
- Then the system SHALL print a message indicating the project is already up to date
- And no files SHALL be modified

---

### Requirement: Manifest-Based Modification Detection

The system SHALL maintain a manifest file at `.specwork/manifest.yaml` containing SHA256 checksums of all managed files written by init or update.

The manifest SHALL be a YAML mapping of relative file paths to their SHA256 hex digest.

The system SHALL generate the manifest during `specwork init` and update it after each successful `specwork update`.

#### Scenario: Init creates manifest
- Given a directory with no `.specwork/` directory
- When the user runs `specwork init`
- Then `.specwork/manifest.yaml` SHALL exist
- And it SHALL contain checksums for all files written by init (templates, `.claude/` files, config.yaml, schema.yaml, examples, .gitignore)

#### Scenario: Detect unmodified file
- Given a manifest entry with checksum `abc123` for `.claude/agents/specwork-implementer.md`
- And the file on disk has checksum `abc123`
- When the update command compares the file
- Then the file SHALL be classified as "unmodified"

#### Scenario: Detect modified file
- Given a manifest entry with checksum `abc123` for `.claude/agents/specwork-implementer.md`
- And the file on disk has checksum `def456`
- When the update command compares the file
- Then the file SHALL be classified as "modified"

#### Scenario: Detect missing manifest (legacy project)
- Given a project initialized before manifest support (no `.specwork/manifest.yaml`)
- When the user runs `specwork update`
- Then the system SHALL treat ALL existing managed files as "modified" (conservative — back up everything)
- And SHALL generate a fresh manifest after the update completes

---

### Requirement: Backup Before Overwrite

The system SHALL back up user-modified managed files to `.specwork/backups/<previous-version>/` before overwriting them.

Unmodified files (checksum matches manifest) SHALL be overwritten without backup.

Files that do not exist on disk SHALL be created without backup.

The backup SHALL preserve the relative path structure of the original file.

#### Scenario: Modified file is backed up
- Given `.claude/agents/specwork-implementer.md` is classified as "modified"
- And the previous `specwork_version` is `0.1.0`
- When the update command processes this file
- Then the original file SHALL be copied to `.specwork/backups/0.1.0/.claude/agents/specwork-implementer.md`
- And the file SHALL be overwritten with the new version's content

#### Scenario: Unmodified file is overwritten silently
- Given `.claude/agents/specwork-qa.md` is classified as "unmodified"
- When the update command processes this file
- Then the file SHALL be overwritten with the new version's content
- And no backup SHALL be created

#### Scenario: New file is created
- Given a new file `.claude/skills/specwork-new-skill/SKILL.md` exists in the current version but not on disk
- When the update command processes this file
- Then the file SHALL be created
- And no backup SHALL be created

---

### Requirement: Config Schema Migration

The `specwork update` command SHALL perform config.yaml migration using a deep-merge strategy: new fields from `DEFAULT_CONFIG` are added with their default values; existing user values are preserved.

The system SHALL NOT remove or rename existing config fields during migration.

The system SHOULD log warnings for deprecated config fields (fields present in user config but absent from `DEFAULT_CONFIG`).

#### Scenario: New field added
- Given config.yaml has no `environments` section
- And `DEFAULT_CONFIG` defines `environments: { env_dir: '.specwork/env', active: 'development' }`
- When the update command migrates the config
- Then config.yaml SHALL contain the `environments` section with default values

#### Scenario: Existing value preserved
- Given config.yaml has `models.default: 'opus'` (user changed from default `'sonnet'`)
- When the update command migrates the config
- Then `models.default` SHALL remain `'opus'`

#### Scenario: Deprecated field warned
- Given config.yaml has a field `legacy_option: true` not present in `DEFAULT_CONFIG`
- When the update command migrates the config
- Then the system SHOULD log a warning: `Deprecated config field: legacy_option`
- And the field SHALL NOT be removed

---

### Requirement: Lock-File Workflow Protection

The `specwork update` command SHALL check for active workflow lock files before proceeding.

If any `.lock` file exists under `.specwork/graph/*/`, the update SHALL be blocked with exit code 2 (BLOCKED).

The error message SHALL name the locked change(s) and advise the user to complete or abort the workflow first.

#### Scenario: Locked workflow blocks update
- Given `.specwork/graph/add-auth/.lock` exists
- When the user runs `specwork update`
- Then the command SHALL exit with code 2
- And the error message SHALL include "add-auth"
- And no files SHALL be modified

#### Scenario: No locks allows update
- Given no `.lock` files exist under `.specwork/graph/`
- When the user runs `specwork update`
- Then the update SHALL proceed normally

---

### Requirement: Dry-Run Mode

The `specwork update` command SHALL support a `--dry-run` flag that previews all changes without modifying any files.

Dry-run output SHALL list each managed file with its status: `create`, `update (unmodified)`, `update (modified — will backup)`, or `skip (unchanged)`.

For files that would be updated, dry-run SHOULD show a diff preview of the changes.

Dry-run SHALL NOT write any files, create backups, or modify config.yaml.

#### Scenario: Dry-run shows pending changes
- Given a project at version `0.1.0` with installed version `0.2.0`
- And `.claude/agents/specwork-implementer.md` has been modified by the user
- When the user runs `specwork update --dry-run`
- Then the output SHALL show `specwork-implementer.md` as `update (modified — will backup)`
- And the output SHALL include a diff preview
- And no files SHALL be modified on disk

#### Scenario: Dry-run when up to date
- Given a project where `specwork_version` matches the installed version
- When the user runs `specwork update --dry-run`
- Then the output SHALL indicate the project is already up to date

---

### Requirement: Doctor Version Check Integration

The `specwork doctor` command SHALL include a `Version` check category.

The Version check SHALL compare `specwork_version` in config.yaml against the installed package version.

A mismatch SHALL be reported as a failing diagnostic with `fixable: true`.

The fix action SHOULD advise running `specwork update`.

#### Scenario: Version matches
- Given `specwork_version` in config.yaml is `0.2.0` and installed version is `0.2.0`
- When `specwork doctor` runs the Version check
- Then the check SHALL pass with label "specwork version is current"

#### Scenario: Version mismatch
- Given `specwork_version` in config.yaml is `0.1.0` and installed version is `0.2.0`
- When `specwork doctor` runs the Version check
- Then the check SHALL fail with detail "Project version 0.1.0, installed 0.2.0 — run `specwork update`"
- And `fixable` SHALL be `true`

#### Scenario: Missing version field
- Given config.yaml has no `specwork_version` field (legacy project)
- When `specwork doctor` runs the Version check
- Then the check SHALL fail with detail "No specwork_version found — run `specwork update`"

---

### Requirement: Session-Init Version Warning

The `session-init.sh` hook SHALL detect version mismatches and print a warning when Claude Code starts a session.

The warning SHALL advise the user to run `specwork update`.

#### Scenario: Stale version warning on session start
- Given config.yaml has `specwork_version: "0.1.0"` and the installed specwork version is `0.2.0`
- When a Claude Code session starts (triggering session-init.sh)
- Then the hook SHALL print a warning containing "specwork update" and the version numbers

#### Scenario: No warning when current
- Given `specwork_version` matches the installed version
- When a Claude Code session starts
- Then no version warning SHALL be printed

---

### Requirement: Update Summary Output

Upon successful completion, `specwork update` SHALL print a summary listing: files updated, files backed up, config fields added, and the new version.

In `--json` mode, the summary SHALL be output as a structured JSON object.

#### Scenario: Human-readable summary
- Given an update from `0.1.0` to `0.2.0` that updated 18 files and backed up 3
- When the update completes
- Then the output SHALL include the count of updated files, backed-up files, and the new version

#### Scenario: JSON output
- Given the `--json` flag is set
- When the update completes
- Then the output SHALL be a JSON object with fields: `updated`, `backedUp`, `configFieldsAdded`, `previousVersion`, `newVersion`, `backupPath`
