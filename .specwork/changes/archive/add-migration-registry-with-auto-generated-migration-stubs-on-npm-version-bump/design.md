# Design: Migration Registry with Auto-Generated Migration Stubs

## Context

The existing `runUpdate()` in `src/core/updater.ts` follows this flow: lock check → version check → classify files → backup → overwrite → config deep-merge → write manifest. The deep merge (`deepMergeConfig()`) handles additive config changes but cannot express removals, renames, or arbitrary project transformations. We need a migration system that slots into this existing flow.

## Goals / Non-Goals

**Goals:**
- Version-keyed migration files that are type-safe and bundled with the package
- Automatic stub generation on `npm version` to reduce friction
- Seamless integration into existing `runUpdate()` flow
- Migration history tracking to prevent re-execution

**Non-Goals:**
- Rollback/downgrade migrations
- Dynamic filesystem scanning for migrations (fragile with ESM bundling)
- Interactive migration prompts

## Decisions

### Decision: Static Registry vs Dynamic Import

Use a **static registry** in `src/migrations/index.ts` that explicitly imports all migration modules, rather than dynamically scanning the filesystem.

**Why:** Dynamic `import()` is fragile with ESM bundling (tsup). A static registry is type-checked at build time, works reliably in both source and bundled contexts, and makes the migration list explicit. The postversion script auto-appends imports to the registry, so the developer experience is the same.

### Decision: Standalone JS Script for Postversion

Use a plain Node.js script (`scripts/generate-migration.js`) rather than a TypeScript file for the postversion hook.

**Why:** npm lifecycle scripts run directly via Node — no build step available. The script is simple (read version, write file, append to registry) and doesn't benefit from TypeScript.

### Decision: Migrations Run After Backup, Before Overwrite

Slot migrations between backup and file overwrite in `runUpdate()`.

**Why:** Backups must exist before any mutation (safety). Migrations may modify config or project state that the subsequent file overwrite and config write depend on. This ordering ensures migrations can safely transform state while backups provide rollback.

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/types/migration.ts` | `MigrationFn`, `MigrationResult`, `MigrationEntry` types |
| `src/migrations/index.ts` | Static migration registry + runner functions |
| `src/migrations/0.2.0.ts` | First migration stub (no-op placeholder) |
| `scripts/generate-migration.js` | Postversion stub generator |

### Modified Files

| File | Change |
|------|--------|
| `src/core/updater.ts` | Call migration runner between backup and file overwrite; extend `ManifestData` with `migrations_applied` |
| `src/cli/update.ts` | Display migration results in CLI output |
| `src/types/common.ts` | Add `migrationsRun: string[]` to `UpdateResult` |
| `package.json` | Add `postversion` script |

### Migration File Format

```typescript
// src/migrations/0.2.0.ts
import type { MigrationFn } from '../types/migration.js';

export const description = 'Migration for version 0.2.0';

export const migrate: MigrationFn = (root, config) => {
  return { changed: false };
};
```

### Types

```typescript
export interface MigrationResult {
  changed: boolean;
  details?: string[];
}

export type MigrationFn = (
  root: string,
  config: Record<string, unknown>,
) => MigrationResult;

export interface MigrationEntry {
  version: string;
  description: string;
  migrate: MigrationFn;
}
```

### Runner Algorithm

```
1. Get all migrations from static registry
2. Filter: version > previousVersion AND version <= installedVersion
3. Filter: version NOT in manifest.migrations_applied
4. Sort by semver ascending
5. For each migration:
   a. Call migrate(root, config)
   b. On error: halt, return partial results with error
   c. Record version + description in results
6. Return executed migration versions
```

### Integration in runUpdate()

```
 1. Check locked workflows          ← existing
 2. Read config + version           ← existing
 3. Classify files                  ← existing
 4. Check if up-to-date            ← existing
 5. Deep-merge config              ← existing
 6. [DRY-RUN BRANCH]              ← extended: include pending migration list
 7. Backup modified files           ← existing
 8. ▶ RUN MIGRATIONS ◀            ← NEW
 9. Write managed files             ← existing
10. Write merged config            ← existing
11. Write manifest (+migrations)   ← extended: include migrations_applied
```

## Risks / Trade-offs

- **[Migration fails mid-way]** → Backups are taken before migrations run; user can restore from `.specwork/backups/<version>/`
- **[Postversion script fails]** → Non-fatal; version bump still succeeds, developer just needs to create stub manually
- **[Migration modifies config that deep-merge overwrites]** → Migrations receive the deep-merged config object, so their changes are preserved through the write step
