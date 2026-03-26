# Design: `specwork update` Command for Safe Version Migration

## Context

Specwork projects are initialized with `specwork init`, which writes ~25 managed files across `.specwork/` and `.claude/`. When the specwork package is upgraded, these files become stale. The only refresh mechanism is `init --force`, which overwrites everything without backup.

The update command introduces a safe migration path: detect what changed, back up user customizations, overwrite with new versions, and merge config schema additively.

## Goals

- Safe upgrade path that preserves user customizations via backup
- Manifest-based change detection (SHA256 checksums)
- Config schema migration that is purely additive (no data loss)
- Clear dry-run preview before committing changes
- Integration with existing doctor and session-init systems

## Non-Goals

- Automatic update on version mismatch (passive detection only)
- Rollback command (backups are manual recovery)
- Semantic merging of user-customized files with new versions
- Breaking config schema changes (restructuring, field removal)

## Decisions

### Decision: SHA256 Manifest over Git-Based Detection

We use a `.specwork/manifest.yaml` file mapping relative paths to SHA256 checksums rather than relying on `git diff` or embedded version headers in each file.

**Why:** Git-based detection requires the project to be a git repo and would mix specwork's managed files with user code changes. Version headers in each file would require parsing and would be fragile across file formats (YAML, Markdown, shell scripts, JSON). A centralized manifest is format-agnostic, works without git, and is trivially auditable.

**Trade-off:** Adds one more file to `.specwork/`. Acceptable given the safety benefits.

### Decision: Deep-Merge Config with Deprecation Warnings (No Removal)

Config migration uses a recursive deep-merge: for each key in `DEFAULT_CONFIG`, if the key is missing in the user's config, add it with the default value. Existing user values are never touched. Fields in user config not present in `DEFAULT_CONFIG` trigger a deprecation warning but are preserved.

**Why:** Additive-only is the safest strategy for a v0.x project. Users may have valid custom fields. Removal can be introduced in a future major version with explicit migration scripts.

### Decision: Block on Lock Files (Strict)

If any `.lock` file exists under `.specwork/graph/*/`, the update is blocked with exit code BLOCKED (2). No partial updates, no skipping `.claude/` files.

**Why:** A partial update (some files new, some old) during an active workflow creates an inconsistent state that's harder to debug than simply requiring the user to finish or abort the workflow first. The lock check is cheap and the error message is actionable.

### Decision: Reuse Embedded Templates from init.ts and claude-files.ts

The update command reads the same `TEMPLATES`, `CLAUDE_FILES`, `CLAUDE_SETTINGS`, `SCHEMA_YAML`, `EXAMPLE_GRAPH`, and `SPECWORK_GITIGNORE` constants used by `initializeProject()`. No separate "update templates" source.

**Why:** Single source of truth. When a developer updates a template, both `init` and `update` automatically use the new version. Extracting `initializeProject()`'s file-writing logic into a shared module ensures consistency.

## Architecture

### New Files

**`src/core/updater.ts`** — Core update logic:

```
generateManifest(root, files) → Record<string, string>    // path → sha256
loadManifest(root) → Record<string, string> | null         // null if no manifest
classifyFiles(manifest, currentFiles) → FileClassification[]
  // { path, status: 'unmodified' | 'modified' | 'new' | 'removed' }
backupFiles(root, version, files) → string[]               // returns backed-up paths
deepMergeConfig(existing, defaults) → { merged, fieldsAdded, deprecated }
runUpdate(root, opts) → UpdateResult
```

**`src/cli/update.ts`** — CLI command:

```
makeUpdateCommand() → Command
  --dry-run    Preview changes without modifying files
  --force      Skip version check (update even if versions match)
  --json       Output as JSON
```

### Modified Files

**`src/cli/init.ts`**:
- Add `specwork_version` to `DEFAULT_CONFIG`
- After `initializeProject()`, call `generateManifest()` and write `.specwork/manifest.yaml`
- Export `initializeProject`, `DEFAULT_CONFIG`, and `TEMPLATES` for reuse by updater

**`src/index.ts`**:
- Import and register `makeUpdateCommand()`
- Add `'update'` to the config validation exclusion list alongside `'init'`

**`src/types/config.ts`**:
- Add `specwork_version?: string` to `SpecworkConfig`
- Add missing fields: `execution.verify`, `spec.archive_dir`, `environments`

**`src/core/doctor.ts`**:
- Add `checkVersion(root)` function to the checker array
- Reads `specwork_version` from config, compares to `pkg.version`

**`src/templates/claude-files.ts`**:
- Update `HOOKS_SESSION_INIT_SH` template to include version mismatch detection

### Data Model

**`.specwork/manifest.yaml`** structure:
```yaml
# Auto-generated by specwork init/update. Do not edit manually.
generated_at: "2026-03-27T00:00:00Z"
specwork_version: "0.2.0"
files:
  ".specwork/config.yaml": "a1b2c3d4..."
  ".specwork/schema.yaml": "e5f6g7h8..."
  ".specwork/templates/proposal.md": "i9j0k1l2..."
  ".claude/agents/specwork-implementer.md": "m3n4o5p6..."
  ".claude/settings.json": "q7r8s9t0..."
  # ... all managed files
```

**`.specwork/backups/<version>/`** structure:
```
.specwork/backups/0.1.0/
  .claude/agents/specwork-implementer.md    # only modified files
  .specwork/config.yaml                     # always backed up (pre-merge)
```

**`config.yaml`** version field:
```yaml
specwork_version: "0.2.0"
models:
  default: sonnet
  # ...
```

### Update Flow

```
specwork update [--dry-run] [--force]
  │
  ├─ Read installed version from package.json
  ├─ Read specwork_version from config.yaml
  ├─ If equal and not --force → "Already up to date" → exit 0
  │
  ├─ Check for .lock files under .specwork/graph/*/
  │   └─ If any found → error + exit 2 (BLOCKED)
  │
  ├─ Load manifest (or null if legacy project)
  ├─ Build list of all managed files from TEMPLATES + CLAUDE_FILES + etc.
  ├─ Classify each file: new | unmodified | modified
  │
  ├─ If --dry-run:
  │   ├─ Print file list with statuses
  │   ├─ Show diffs for files that would change
  │   └─ exit 0
  │
  ├─ Backup modified files → .specwork/backups/<old-version>/
  ├─ Write all managed files (same logic as initializeProject)
  ├─ Deep-merge config.yaml (add new fields, warn deprecated)
  ├─ Update specwork_version in config.yaml
  ├─ Generate and write new manifest.yaml
  ├─ Run doctor health check
  └─ Print summary
```

## Risks / Trade-offs

- **[Risk] First update on legacy project (no manifest)** → Mitigation: treat all files as modified, back up everything. User gets a noisy first update but loses nothing.
- **[Risk] SpecworkConfig type drift** → Mitigation: this change fixes the drift by adding missing fields. Future changes should keep type and DEFAULT_CONFIG in sync.
- **[Risk] Large backup directories over many updates** → Mitigation: backups are small (only modified files). Could add `specwork update --prune-backups` in the future.
- **[Risk] Manifest file corruption or manual editing** → Mitigation: manifest is regenerated on every update. If corrupted, worst case is all files treated as modified (extra backups, no data loss).

## Open Questions

None — all design decisions resolved via user input during planning phase.
