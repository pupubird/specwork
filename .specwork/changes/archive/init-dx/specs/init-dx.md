# Spec: init-dx

### Requirement: Batteries-Included Init

`specwork init` SHALL write a complete, working Specwork environment without requiring any flags.

The command SHALL create all required directories, config files, templates, schema, examples, gitignore, and all `.claude/` integration files (agents, skills, commands, hooks, settings) in a single invocation.

The `--with-claude` flag SHALL NOT exist. Claude integration is always included.

#### Scenario: Fresh init writes all files
- Given a directory with no `.specwork/` present
- When `specwork init` is run
- Then `.specwork/config.yaml`, `.specwork/schema.yaml`, `.specwork/templates/`, `.specwork/specs/`, `.specwork/changes/archive/`, `.specwork/graph/`, `.specwork/nodes/`, `.specwork/env/`, `.specwork/.gitignore`, `.specwork/examples/example-graph.yaml` SHALL all exist
- And `.claude/agents/`, `.claude/skills/`, `.claude/commands/`, `.claude/hooks/`, `.claude/settings.json` SHALL all exist
- And all 17 agent/skill/command/hook files SHALL be present with non-empty content

#### Scenario: Config includes verify key
- Given a fresh `specwork init`
- When `.specwork/config.yaml` is read
- Then `execution.verify` SHALL equal `'gates'`

#### Scenario: Gitignore covers runtime files
- Given a fresh `specwork init`
- When `.specwork/.gitignore` is read
- Then it SHALL contain entries for `.current-scope`, `.current-node`, and `*.lock`

#### Scenario: Post-init message references correct command
- Given a fresh `specwork init`
- When the command completes
- Then the output SHALL reference `specwork plan` as the next step
- And SHALL NOT reference `specwork new`

---

### Requirement: Doctor Auto-Run After Init

`specwork init` SHALL automatically run `specwork doctor` as the final step and display the results inline.

#### Scenario: Doctor results shown after init
- Given a fresh `specwork init` completes successfully
- When the command finishes
- Then `specwork doctor` output SHALL be displayed showing health check results
- And the exit code SHALL reflect the doctor result (non-zero if doctor fails)

---

### Requirement: Idempotent Re-Init with --force

`specwork init --force` SHALL re-initialize an already-initialized directory by overwriting all files.

#### Scenario: Force re-init on existing directory
- Given `.specwork/` already exists
- When `specwork init --force` is run
- Then all files SHALL be re-written with current embedded content
- And the command SHALL succeed (exit 0)

#### Scenario: Init without force on existing directory
- Given `.specwork/` already exists
- When `specwork init` is run without `--force`
- Then the command SHALL exit with an error
- And SHALL display a message suggesting `--force`

---

### Requirement: OpenSpec Migration Mapping

`specwork init migrate` SHALL map `openspec/` directory contents to `.specwork/` layout according to defined rules.

The following path mappings SHALL apply:

| Source | Destination |
|--------|-------------|
| `openspec/specs/<name>/spec.md` | `.specwork/specs/<name>.md` |
| `openspec/changes/<name>/proposal.md` | `.specwork/changes/<name>/proposal.md` |
| `openspec/changes/<name>/specs/<specname>/spec.md` | `.specwork/changes/<name>/specs/<specname>.md` |

The subdirectory level under `openspec/specs/<name>/` SHALL be flattened — only `spec.md` is mapped; the directory name becomes the file name.

#### Scenario: Spec file flattening
- Given `openspec/specs/auth/spec.md` exists
- When `specwork init migrate` is run
- Then `.specwork/specs/auth.md` SHALL exist with the same content
- And `openspec/specs/auth/` SHALL no longer exist

#### Scenario: Change directory mapping
- Given `openspec/changes/add-jwt/proposal.md` and `openspec/changes/add-jwt/specs/auth/spec.md` exist
- When `specwork init migrate` is run
- Then `.specwork/changes/add-jwt/proposal.md` SHALL exist
- And `.specwork/changes/add-jwt/specs/auth.md` SHALL exist

---

### Requirement: Destructive Migration with Validation

`specwork init migrate` SHALL delete the `openspec/` directory after successful file migration.

#### Scenario: openspec deleted after migrate
- Given a successful file migration
- When `specwork init migrate` completes
- Then `openspec/` SHALL NOT exist

#### Scenario: Migrate errors if openspec missing
- Given no `openspec/` directory exists at cwd
- When `specwork init migrate` is run
- Then the command SHALL exit with an error
- And SHALL NOT modify `.specwork/`

#### Scenario: Migrate runs init first if .specwork missing
- Given no `.specwork/` exists but `openspec/` does
- When `specwork init migrate` is run
- Then `specwork init` SHALL run first to create `.specwork/`
- And migration SHALL proceed after successful init

#### Scenario: Doctor runs after migrate
- Given a successful migration
- When `specwork init migrate` completes
- Then `specwork doctor` SHALL run and results SHALL be displayed inline
- And a migration summary SHALL be shown (files moved count, specs migrated count)
