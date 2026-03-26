## 1. Types & Template Module

- [x] 1.1 Define `MigrateResult` and `InitResult` types in `src/types/` for structured init/migrate output
- [ ] 1.2 Create `src/templates/claude-files.ts` exporting `CLAUDE_FILES: Record<string, string>` with all 17 embedded `.claude/` file contents (agents, skills, commands, hooks)

## 2. Enhanced `foreman init`

- [x] 2.1 Rewrite `makeInitCommand()` in `src/cli/init.ts`: remove `--with-claude` flag, add `execution.verify: 'gates'` to default config, write `schema.yaml`, `examples/example-graph.yaml`, `.foreman/.gitignore`, `.claude/settings.json`, and all files from `CLAUDE_FILES`
- [ ] 2.2 Fix post-init message (`foreman plan` not `foreman new`) and add doctor auto-run as final init step

## 3. Migration Core

- [x] 3.1 Implement `migrateOpenspec(cwd: string): Promise<MigrateResult>` in `src/core/migrate.ts`: scan `openspec/specs/` and `openspec/changes/`, apply path mapping rules, copy files, merge config, delete `openspec/`

## 4. Migration CLI

- [x] 4.1 Register `init migrate` subcommand in `src/cli/init.ts`: validate `openspec/` exists, call `migrateOpenspec()`, run doctor, display migration summary table

## 5. Init Tests

- [x] 5.1 Unit tests for enhanced init: verify all expected files written, correct config keys, `.gitignore` contents, `.claude/settings.json` hooks
- [ ] 5.2 Integration test for `foreman init --force`: verify idempotent re-init overwrites existing files without error

## 6. Migration Tests

- [ ] 6.1 Unit tests for `migrateOpenspec()`: spec path flattening, change directory mapping, config merge, `openspec/` deletion
- [ ] 6.2 Integration test for `foreman init migrate`: fixture `openspec/` tree → assert `.foreman/specs/` and `.foreman/changes/` contents match expected mapping, `openspec/` deleted
