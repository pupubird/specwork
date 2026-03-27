# Spec: Migration Registry

## ADDED

### Requirement: Migration File Format

Each migration file SHALL be a TypeScript module in `src/migrations/` named by its target version (e.g., `0.2.0.ts`). Each migration file SHALL export a `migrate` function that receives the project root path and the current parsed config, and returns a `MigrationResult`. Each migration file SHALL export a `description` string summarizing what the migration does. Migrations MUST be idempotent — running the same migration twice on the same project SHALL produce the same end state.

#### Scenario: Valid migration file structure
- Given a migration file at `src/migrations/0.2.0.ts`
- When the file is loaded by the migration runner
- Then it SHALL export a `migrate` function with signature `(root: string, config: Record<string, unknown>) => MigrationResult`
- And it SHALL export a `description` string

#### Scenario: Idempotent migration execution
- Given a migration that renames config key `env` to `environments`
- When the migration runs on a project that already has `environments` and no `env`
- Then the migration SHALL complete successfully without error
- And the config SHALL remain unchanged

### Requirement: Migration Runner

The migration runner SHALL discover all migration files in `src/migrations/`, filter to those with versions greater than the project's current `specwork_version` and less than or equal to the installed version, and execute them in ascending semver order.

#### Scenario: Sequential version upgrade
- Given a project at version `0.1.0` and installed version `0.3.0`
- When the migration runner executes
- Then it SHALL run migration `0.2.0` before migration `0.3.0`
- And it SHALL not run migration `0.1.0`

#### Scenario: No pending migrations
- Given a project at version `0.2.0` and installed version `0.2.0`
- When the migration runner executes
- Then it SHALL run zero migrations
- And it SHALL return an empty results array

#### Scenario: Migration failure halts execution
- Given migrations `0.2.0` and `0.3.0` are pending
- When migration `0.2.0` throws an error
- Then migration `0.3.0` SHALL NOT execute
- And the runner SHALL report the failure with the migration version and error message

### Requirement: Update Integration

The migration runner SHALL be invoked within `runUpdate()` after the backup step and before the file overwrite step. The `UpdateResult` type SHALL be extended to include `migrationsRun` reporting which migrations executed.

#### Scenario: Migration runs during update
- Given a project at version `0.1.0` updating to `0.3.0`
- When `runUpdate()` executes
- Then backups SHALL be created before any migration runs
- And migrations SHALL execute before managed files are overwritten
- And the result SHALL include `migrationsRun: ["0.2.0", "0.3.0"]`

#### Scenario: Dry-run shows pending migrations
- Given a project at version `0.1.0` with installed version `0.3.0`
- When `runUpdate()` executes with `dryRun: true`
- Then the result SHALL include `migrationsRun: ["0.2.0", "0.3.0"]`
- And no migration functions SHALL actually execute
- And no files SHALL be modified

### Requirement: Migration History Tracking

The manifest (`manifest.yaml`) SHALL track which migrations have been applied in a `migrations_applied` array. The migration runner SHALL skip any migration already present in this array, even if the version falls within the pending range.

#### Scenario: Previously applied migration is skipped
- Given manifest contains `migrations_applied: ["0.2.0"]`
- And the project is at version `0.1.0` updating to `0.3.0`
- When the migration runner executes
- Then only migration `0.3.0` SHALL execute
- And `migrations_applied` SHALL be updated to `["0.2.0", "0.3.0"]`

#### Scenario: Manifest updated after successful migration
- Given migrations `0.2.0` and `0.3.0` run successfully
- When the manifest is written
- Then `migrations_applied` SHALL contain both `"0.2.0"` and `"0.3.0"`

### Requirement: Postversion Auto-Scaffold

An npm `postversion` script SHALL auto-generate a migration stub file when `npm version patch|minor|major` is run. The stub SHALL be placed at `src/migrations/<new-version>.ts` and SHALL contain a skeleton `migrate` function and `description` export.

#### Scenario: Stub generated on version bump
- Given the current package version is `0.1.0`
- When `npm version minor` runs (bumping to `0.2.0`)
- Then a file SHALL be created at `src/migrations/0.2.0.ts`
- And the file SHALL export a `migrate` function and `description` string
- And the `description` SHALL default to `"Migration for version 0.2.0"`

#### Scenario: Existing migration file is not overwritten
- Given a migration file already exists at `src/migrations/0.2.0.ts`
- When `npm version` would create version `0.2.0`
- Then the existing file SHALL NOT be overwritten
- And a warning SHALL be printed to stderr

### Requirement: Update Command Output

The `specwork update` CLI output SHALL display which migrations were executed (or would execute in dry-run mode), including each migration's version and description.

#### Scenario: Update output with migrations
- Given migrations `0.2.0` and `0.3.0` executed during update
- When the CLI displays the update result
- Then the output SHALL list each migration version and its description
- And the JSON output SHALL include a `migrationsRun` array
