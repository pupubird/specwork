# Spec: init-dx

### Requirement: Batteries-Included Init

`foreman init` SHALL write a complete, working Foreman environment without requiring any flags.

The command SHALL create all required directories, config files, templates, schema, examples, gitignore, and all `.claude/` integration files (agents, skills, commands, hooks, settings) in a single invocation.

The `--with-claude` flag SHALL NOT exist. Claude integration is always included.

#### Scenario: Fresh init writes all files
- Given a directory with no `.foreman/` present
- When `foreman init` is run
- Then `.foreman/config.yaml`, `.foreman/schema.yaml`, `.foreman/templates/`, `.foreman/specs/`, `.foreman/changes/archive/`, `.foreman/graph/`, `.foreman/nodes/`, `.foreman/env/`, `.foreman/.gitignore`, `.foreman/examples/example-graph.yaml` SHALL all exist
- And `.claude/agents/`, `.claude/skills/`, `.claude/commands/`, `.claude/hooks/`, `.claude/settings.json` SHALL all exist
- And all 17 agent/skill/command/hook files SHALL be present with non-empty content

#### Scenario: Config includes verify key
- Given a fresh `foreman init`
- When `.foreman/config.yaml` is read
- Then `execution.verify` SHALL equal `'gates'`

#### Scenario: Gitignore covers runtime files
- Given a fresh `foreman init`
- When `.foreman/.gitignore` is read
- Then it SHALL contain entries for `.current-scope`, `.current-node`, and `*.lock`

#### Scenario: Post-init message references correct command
- Given a fresh `foreman init`
- When the command completes
- Then the output SHALL reference `foreman plan` as the next step
- And SHALL NOT reference `foreman new`

---

### Requirement: Doctor Auto-Run After Init

`foreman init` SHALL automatically run `foreman doctor` as the final step and display the results inline.

#### Scenario: Doctor results shown after init
- Given a fresh `foreman init` completes successfully
- When the command finishes
- Then `foreman doctor` output SHALL be displayed showing health check results
- And the exit code SHALL reflect the doctor result (non-zero if doctor fails)

---

### Requirement: Idempotent Re-Init with --force

`foreman init --force` SHALL re-initialize an already-initialized directory by overwriting all files.

#### Scenario: Force re-init on existing directory
- Given `.foreman/` already exists
- When `foreman init --force` is run
- Then all files SHALL be re-written with current embedded content
- And the command SHALL succeed (exit 0)

#### Scenario: Init without force on existing directory
- Given `.foreman/` already exists
- When `foreman init` is run without `--force`
- Then the command SHALL exit with an error
- And SHALL display a message suggesting `--force`

---

### Requirement: OpenSpec Migration Mapping

`foreman init migrate` SHALL map `openspec/` directory contents to `.foreman/` layout according to defined rules.

The following path mappings SHALL apply:

| Source | Destination |
|--------|-------------|
| `openspec/specs/<name>/spec.md` | `.foreman/specs/<name>.md` |
| `openspec/changes/<name>/proposal.md` | `.foreman/changes/<name>/proposal.md` |
| `openspec/changes/<name>/specs/<specname>/spec.md` | `.foreman/changes/<name>/specs/<specname>.md` |

The subdirectory level under `openspec/specs/<name>/` SHALL be flattened — only `spec.md` is mapped; the directory name becomes the file name.

#### Scenario: Spec file flattening
- Given `openspec/specs/auth/spec.md` exists
- When `foreman init migrate` is run
- Then `.foreman/specs/auth.md` SHALL exist with the same content
- And `openspec/specs/auth/` SHALL no longer exist

#### Scenario: Change directory mapping
- Given `openspec/changes/add-jwt/proposal.md` and `openspec/changes/add-jwt/specs/auth/spec.md` exist
- When `foreman init migrate` is run
- Then `.foreman/changes/add-jwt/proposal.md` SHALL exist
- And `.foreman/changes/add-jwt/specs/auth.md` SHALL exist

---

### Requirement: Destructive Migration with Validation

`foreman init migrate` SHALL delete the `openspec/` directory after successful file migration.

#### Scenario: openspec deleted after migrate
- Given a successful file migration
- When `foreman init migrate` completes
- Then `openspec/` SHALL NOT exist

#### Scenario: Migrate errors if openspec missing
- Given no `openspec/` directory exists at cwd
- When `foreman init migrate` is run
- Then the command SHALL exit with an error
- And SHALL NOT modify `.foreman/`

#### Scenario: Migrate runs init first if .foreman missing
- Given no `.foreman/` exists but `openspec/` does
- When `foreman init migrate` is run
- Then `foreman init` SHALL run first to create `.foreman/`
- And migration SHALL proceed after successful init

#### Scenario: Doctor runs after migrate
- Given a successful migration
- When `foreman init migrate` completes
- Then `foreman doctor` SHALL run and results SHALL be displayed inline
- And a migration summary SHALL be shown (files moved count, specs migrated count)
