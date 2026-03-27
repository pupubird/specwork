## 1. Migration Types and Registry

- [ ] 1.1 Create `src/types/migration.ts` with `MigrationFn`, `MigrationResult`, and `MigrationEntry` types
- [ ] 1.2 Create `src/migrations/index.ts` with empty `migrations` registry array, `getPendingMigrations()`, and `runMigrations()` exports
- [ ] 1.3 Extend `UpdateResult` in `src/types/common.ts` to include `migrationsRun: string[]`
- [ ] 1.4 Extend `ManifestData` in `src/core/updater.ts` to include optional `migrations_applied: string[]`

## 2. Migration Runner Integration

- [ ] 2.1 Implement `getPendingMigrations(previousVersion, installedVersion, appliedMigrations)` — filters registry by semver range, excludes already-applied, sorts ascending
- [ ] 2.2 Implement `runMigrations(root, config, pendingMigrations)` — executes in order, halts on failure, returns versions and details
- [ ] 2.3 Integrate migration runner into `runUpdate()` — call after backup, before file overwrite; extend dry-run branch to list pending migrations; write `migrations_applied` to manifest

## 3. Postversion Stub Generator

- [ ] 3.1 Create `scripts/generate-migration.js` — reads version from package.json, generates stub at `src/migrations/<version>.ts`, appends import to `src/migrations/index.ts` registry
- [ ] 3.2 Add `postversion` script to `package.json`
- [ ] 3.3 Create initial migration stub `src/migrations/0.2.0.ts` as a no-op placeholder

## 4. CLI Output and Tests

- [ ] 4.1 Update `src/cli/update.ts` to display migration results (versions and descriptions) in both text and JSON output
- [ ] 4.2 Write tests for migration runner: semver filtering, ordering, idempotency, failure halting, manifest tracking
- [ ] 4.3 Write tests for stub generator: file creation, no-overwrite guard, registry update
