# Proposal: Add `specwork update` Command for Safe Version Migration

## Why

When specwork is upgraded (e.g., `npm update specwork`), the installed package ships new templates, agent prompts, hook scripts, config schema fields, and skills. But the project's `.specwork/` and `.claude/` files remain frozen at the version they were initialized with. There is no safe way to bring them forward:

- `specwork init --force` overwrites everything unconditionally, destroying user customizations
- Manual file-by-file diffing is error-prone and tedious (16+ `.claude/` files, 4 templates, config, schema, examples)
- Users have no way to know which files are stale or what changed between versions

This creates version drift where projects silently run with outdated agent prompts, missing config fields, and stale hooks.

## What Changes

- **NEW**: `specwork update` CLI command that migrates all managed files to the current specwork version
- **NEW**: SHA256 manifest system (`.specwork/manifest.yaml`) tracking checksums of all managed files
- **NEW**: `specwork_version` field in `config.yaml` to track which version initialized/last updated the project
- **NEW**: Backup system at `.specwork/backups/<version>/` preserving user-modified files before overwrite
- **NEW**: Config schema migration via deep-merge (additive fields, deprecation warnings)
- **NEW**: `--dry-run` flag showing what would change without modifying anything
- **NEW**: Doctor integration — `Version` check category flags stale `specwork_version`
- **MODIFIED**: `specwork init` writes `specwork_version` to config and generates initial manifest
- **MODIFIED**: `session-init.sh` hook prints warning when version mismatch detected
- **MODIFIED**: `config-validator.ts` preAction hook excludes `update` command (same as `init`)
- **MODIFIED**: `SpecworkConfig` type updated to include missing fields (`verify`, `archive_dir`, `environments`, `specwork_version`)

## Capabilities

### New Capabilities
- `update-command`: Core update workflow — version check, manifest diff, backup, overwrite, config migration, dry-run

### Modified Capabilities
- `init-dx`: Init now writes `specwork_version` to config.yaml and generates `.specwork/manifest.yaml`
- `foreman-doctor`: Doctor gains `Version` check category to flag stale `specwork_version`

## Impact

**Files created:**
- `src/cli/update.ts` — CLI command definition
- `src/core/updater.ts` — update orchestration logic (manifest, backup, overwrite, config migration)

**Files modified:**
- `src/cli/init.ts` — add manifest generation and `specwork_version` to DEFAULT_CONFIG
- `src/index.ts` — register update command, exclude from config validation
- `src/types/config.ts` — add missing fields to SpecworkConfig interface
- `src/core/doctor.ts` — add `checkVersion()` checker
- `src/templates/claude-files.ts` — update session-init.sh to warn on version mismatch
