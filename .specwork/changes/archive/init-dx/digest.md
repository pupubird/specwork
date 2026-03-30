# Summary: init-dx

**Archived:** 2026-03-26 | **Nodes:** 13 | **Status:** complete

## Summary

Batteries-included `specwork init` overhaul: always writes all 17 `.claude/` files (agents, skills, commands, hooks), `schema.yaml`, `examples/`, `.gitignore`, and correct config — zero flags required. Removes the `--with-claude` footgun, fixes the post-init message (`specwork plan` not `specwork new`), adds `--force` for idempotent re-init, auto-runs doctor after init, and adds `specwork init migrate` for automated `openspec/` → `.specwork/` migration with spec path flattening.

## Node Timeline

- **snapshot**: Environment snapshot captured
- **write-tests**: Unit and integration tests written for enhanced init, --force re-init, migrateOpenspec(), and specwork init migrate CLI
- **impl-1-1**: MigrateResult and InitResult types defined in src/types/
- **impl-1-2**: src/templates/claude-files.ts created exporting CLAUDE_FILES with all 17 embedded .claude/ file contents
- **impl-2-1**: makeInitCommand() rewritten — removes --with-claude, adds execution.verify: 'gates', writes schema.yaml, examples/, .gitignore, .claude/settings.json, all CLAUDE_FILES
- **impl-2-2**: Post-init message fixed to specwork plan; doctor auto-run added as final init step
- **impl-3-1**: migrateOpenspec() implemented in src/core/migrate.ts — scans openspec/specs/ and openspec/changes/, applies path mapping (flatten spec subdirs), copies files, merges config, deletes openspec/
- **impl-4-1**: init migrate subcommand registered — validates openspec/ exists, calls migrateOpenspec(), runs doctor, displays migration summary table
- **impl-5-1**: Unit tests for enhanced init: all expected files written, correct config keys, .gitignore, .claude/settings.json hooks
- **impl-5-2**: Integration test for specwork init --force: idempotent re-init without error
- **impl-6-1**: Unit tests for migrateOpenspec(): spec path flattening, change directory mapping, config merge, openspec/ deletion
- **impl-6-2**: Integration test for specwork init migrate: fixture openspec/ tree → correct .specwork/ contents, openspec/ deleted
- **integration**: All tests pass

## Verification Summary

| Node | Verdict |
|------|---------|
| snapshot | PASS |
| write-tests | PASS |
| impl-1-1 | PASS |
| impl-1-2 | PASS |
| impl-2-1 | PASS |
| impl-2-2 | PASS |
| impl-3-1 | PASS |
| impl-4-1 | PASS |
| impl-5-1 | PASS |
| impl-5-2 | PASS |
| impl-6-1 | PASS |
| impl-6-2 | PASS |
| integration | PASS |
