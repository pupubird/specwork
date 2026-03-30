# Summary: add-migration-registry-with-auto-generated-migration-stubs-on-npm-version-bump

**Archived:** 2026-03-27 | **Nodes:** 9 | **Status:** complete

## Summary

Add a version-keyed migration registry (`src/migrations/`) with a semver-ordered runner integrated into `specwork update`, plus an npm `postversion` hook that auto-generates migration stubs when `npm version` is run. Fixes the gap in `deepMergeConfig()` which could not remove deprecated keys, rename fields, or run arbitrary project-level transformations.

## Node Timeline

- **snapshot**: Environment snapshot captured: file tree, deps, exported types
- **write-tests**: Tests written for migration runner: semver filtering, ordering, idempotency, failure halting, manifest tracking, and stub generator
- **impl-1-1**: MigrationFn, MigrationResult, MigrationEntry types created in src/types/migration.ts
- **impl-1-2**: src/migrations/index.ts with empty registry, getPendingMigrations(), runMigrations() exports
- **impl-1-3**: UpdateResult extended with migrationsRun: string[] in src/types/common.ts
- **impl-1-4**: ManifestData extended with optional migrations_applied: string[] in src/core/updater.ts
- **impl-2-1**: getPendingMigrations() filters by semver range, excludes applied, sorts ascending
- **impl-2-2**: runMigrations() executes in order, halts on failure, returns versions and details
- **impl-2-3**: Migration runner integrated into runUpdate() — after backup, before file overwrite; dry-run lists pending; manifest tracks applied
- **impl-3-1**: scripts/generate-migration.js reads version from package.json, generates stub, appends to registry
- **impl-3-2**: postversion script added to package.json
- **impl-3-3**: Initial migration stub src/migrations/0.2.0.ts created as no-op placeholder
- **impl-4-1**: src/cli/update.ts updated to display migration results in text and JSON output
- **impl-4-2**: Tests for migration runner and stub generator written
- **integration**: All tests pass

## Verification Summary

| Node | Verdict |
|------|---------|
| snapshot | PASS |
| write-tests | PASS |
| impl-1-1 | PASS |
| impl-1-2 | PASS |
| impl-1-3 | PASS |
| impl-1-4 | PASS |
| impl-2-1 | PASS |
| impl-2-2 | PASS |
| impl-2-3 | PASS |
| impl-3-1 | PASS |
| impl-3-2 | PASS |
| impl-3-3 | PASS |
| impl-4-1 | PASS |
| impl-4-2 | PASS |
| integration | PASS |
