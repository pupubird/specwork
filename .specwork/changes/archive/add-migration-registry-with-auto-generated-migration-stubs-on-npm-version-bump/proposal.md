# Proposal: Migration Registry with Auto-Generated Migration Stubs

## Problem

Specwork's `specwork update` command currently handles version upgrades via `deepMergeConfig()` — an additive-only deep merge that can add new config fields but **cannot**:

- Remove deprecated config keys
- Rename config fields
- Transform data formats (e.g., string → object)
- Run arbitrary project-level migrations (move files, update directory structures)
- Apply version-specific logic that differs between upgrade paths (0.1→0.2 vs 0.1→0.3)

As specwork evolves, each version bump may require version-specific migration logic that a simple deep merge cannot express. Without a migration system, users upgrading across multiple versions will hit broken states.

## Solution

Add a **migration registry** — a `src/migrations/` directory where each file is a version-keyed migration (e.g., `0.2.0.ts`) containing an exported `migrate()` function. When `specwork update` runs, it executes all pending migrations between the old and new version in semver order.

Additionally, add an npm `postversion` hook that **auto-generates a migration stub** whenever `npm version patch/minor/major` is run, pre-filling it with a diff of `DEFAULT_CONFIG` changes to reduce manual work.

## What Changes

### New Capabilities
- `migration-registry`: Version-keyed migration files with a runner that executes pending migrations in semver order during `specwork update`

### Modified Capabilities
- `update-command`: Extended to run migrations after backup/before file overwrite, report migration results in CLI output, and track applied migrations in manifest

## Impact

- `src/core/updater.ts` — migration runner integration in `runUpdate()`
- `src/cli/update.ts` — display migration results
- `src/types/common.ts` — extend `UpdateResult`
- `package.json` — add `postversion` script
- New: `src/migrations/`, `src/types/migration.ts`, `scripts/generate-migration.js`

## Scope

**In scope:**
- `src/migrations/` directory with version-keyed migration files
- `MigrationFn` type and migration file format
- Migration runner that discovers and executes pending migrations in semver order
- Integration into `runUpdate()` — migrations run after backup, before file overwrite
- npm `postversion` script that scaffolds a new migration stub
- Dry-run support (migrations report what they would do)
- Migration history tracking in manifest

**Out of scope:**
- Downgrade/rollback migrations
- Interactive migration prompts
- Migration testing framework
- Remote migration registry

## Success Criteria

- Running `npm version minor` auto-creates `src/migrations/<new-version>.ts` with a stub
- Running `specwork update` on a project at version 0.1.0 when installed version is 0.3.0 executes migrations for 0.2.0 and 0.3.0 in order
- Migrations are idempotent — re-running produces the same result
- Dry-run mode shows which migrations would run without executing them
- Migration history is tracked in `manifest.yaml` to prevent re-execution
