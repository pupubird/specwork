# Summary: add-specwork-update-command-for-safe-version-migration

**Archived:** 2026-03-27 | **Nodes:** 11 | **Status:** complete

## Summary

Add `specwork update` CLI command for safe version migration: SHA256 manifest-based change detection, backup of user-modified files before overwrite, additive config deep-merge, dry-run preview, and doctor integration. Replaces the previous `init --force` footgun with a surgical upgrade path that preserves user customizations.

## Node Timeline

- **snapshot**: Environment snapshot captured: file tree, deps, exported types
- **write-tests**: Tests written for manifest system, backup logic, config migration, and update orchestrator
- **impl-1-1**: SpecworkConfig updated with specwork_version, execution.verify, spec.archive_dir, environments fields
- **impl-1-2**: specwork_version added to DEFAULT_CONFIG in src/cli/init.ts
- **impl-1-3**: UpdateResult and FileClassification types added to src/types/common.ts
- **impl-2-1**: computeFileChecksum() returning SHA256 hex digest implemented
- **impl-2-2**: generateManifest() computing checksums for all managed file paths implemented
- **impl-2-3**: loadManifest() reading .specwork/manifest.yaml or returning null implemented
- **impl-2-4**: writeManifest() writing manifest.yaml with generated_at and specwork_version implemented
- **impl-2-5**: classifyFiles() comparing on-disk checksums against manifest returning FileClassification[] implemented
- **impl-3-1**: backupFiles() copying modified files to .specwork/backups/<version>/ implemented
- **impl-3-2**: deepMergeConfig() recursively merging DEFAULT_CONFIG with deprecation warnings implemented
- **impl-3-3**: checkLockedWorkflows() scanning .specwork/graph/*/.lock implemented
- **impl-4-1**: runUpdate() orchestrating full update flow implemented
- **impl-4-2**: collectManagedFiles() building complete managed file list implemented
- **impl-5-1**: makeUpdateCommand() with --dry-run, --force, --json flags implemented
- **impl-5-2**: Dry-run output: file list with status labels and diffs implemented
- **impl-5-3**: Human-readable update summary implemented
- **impl-5-4**: JSON output mode for update results implemented
- **impl-6-1**: initializeProject() updated to call generateManifest() and writeManifest()
- **impl-6-2**: DEFAULT_CONFIG, TEMPLATES, initializeProject exported from init.ts
- **impl-6-3**: makeUpdateCommand() registered in src/index.ts with 'update' in exclusion list
- **impl-7-1**: checkVersion() added to src/core/doctor.ts
- **impl-7-2**: checkVersion registered in doctor's allCheckers array
- **impl-7-3**: session-init.sh template updated to detect version mismatch and print warning
- **integration**: All tests pass

## Verification Summary

| Node | Verdict |
|------|---------|
| snapshot | PASS |
| write-tests | PASS |
| impl-1-1 | PASS |
| impl-1-2 | PASS |
| impl-1-3 | PASS |
| impl-2-1 | PASS |
| impl-2-2 | PASS |
| impl-2-3 | PASS |
| impl-2-4 | PASS |
| impl-2-5 | PASS |
| impl-3-1 | PASS |
| impl-3-2 | PASS |
| impl-3-3 | PASS |
| impl-4-1 | PASS |
| impl-4-2 | PASS |
| impl-5-1 | PASS |
| impl-5-2 | PASS |
| impl-5-3 | PASS |
| impl-5-4 | PASS |
| impl-6-1 | PASS |
| impl-6-2 | PASS |
| impl-6-3 | PASS |
| impl-7-1 | PASS |
| impl-7-2 | PASS |
| impl-7-3 | PASS |
| integration | PASS |
