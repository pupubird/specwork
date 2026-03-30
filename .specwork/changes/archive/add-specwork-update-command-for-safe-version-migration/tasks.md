## 1. Type System and Config Foundation

- [x] 1.1 Update SpecworkConfig interface in src/types/config.ts to add missing fields: specwork_version (optional string), execution.verify, spec.archive_dir, environments section
- [x] 1.2 Add specwork_version to DEFAULT_CONFIG in src/cli/init.ts (value read from package.json at runtime)
- [x] 1.3 Add UpdateResult and FileClassification types to src/types/common.ts

## 2. Manifest System (src/core/updater.ts — manifest functions)

- [x] 2.1 Implement computeFileChecksum(filePath) returning SHA256 hex digest
- [x] 2.2 Implement generateManifest(root, files) that computes checksums for all managed file paths and returns the manifest object
- [x] 2.3 Implement loadManifest(root) that reads .specwork/manifest.yaml or returns null
- [x] 2.4 Implement writeManifest(root, manifest) that writes manifest.yaml with generated_at timestamp and specwork_version
- [x] 2.5 Implement classifyFiles(manifest, managedFiles, root) that compares on-disk checksums against manifest to return FileClassification[] (new/unmodified/modified)

## 3. Backup and Config Migration (src/core/updater.ts — update functions)

- [x] 3.1 Implement backupFiles(root, version, files) that copies modified files to .specwork/backups/<version>/ preserving relative paths
- [x] 3.2 Implement deepMergeConfig(existing, defaults) that recursively merges DEFAULT_CONFIG under existing config, returning { merged, fieldsAdded, deprecated }
- [x] 3.3 Implement checkLockedWorkflows(root) that scans .specwork/graph/*/.lock and returns locked change names or empty array

## 4. Update Orchestrator (src/core/updater.ts — runUpdate)

- [x] 4.1 Implement runUpdate(root, opts) orchestrating the full update flow: version check → lock check → classify → backup → overwrite → config merge → write manifest → return UpdateResult
- [x] 4.2 Implement collectManagedFiles() that builds the complete list of managed file paths and their expected content from TEMPLATES, CLAUDE_FILES, CLAUDE_SETTINGS, SCHEMA_YAML, EXAMPLE_GRAPH, SPECWORK_GITIGNORE, and DEFAULT_CONFIG

## 5. CLI Command (src/cli/update.ts)

- [x] 5.1 Implement makeUpdateCommand() with --dry-run, --force, and --json flags following the existing commander pattern from init.ts
- [x] 5.2 Implement dry-run output: list files with status labels, show diffs for changed files
- [x] 5.3 Implement human-readable update summary (files updated, backed up, config fields added, new version)
- [x] 5.4 Implement JSON output mode for update results

## 6. Init Integration

- [x] 6.1 Modify initializeProject() in src/cli/init.ts to call generateManifest() and writeManifest() after writing all files
- [x] 6.2 Export DEFAULT_CONFIG, TEMPLATES, and initializeProject from init.ts for reuse by updater
- [x] 6.3 Register makeUpdateCommand() in src/index.ts and add 'update' to config validation exclusion list

## 7. Doctor and Session-Init Integration

- [x] 7.1 Add checkVersion(root) function to src/core/doctor.ts that compares specwork_version against installed package version
- [x] 7.2 Register checkVersion in the doctor's allCheckers array
- [x] 7.3 Update the session-init.sh template in src/templates/instructions/ to detect specwork_version mismatch and print a warning
