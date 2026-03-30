# Summary: add-specwork-archive-command-for-clean-change-archival-with-summary-generation

**Archived:** 2026-03-27 | **Nodes:** 13 | **Status:** complete

## Summary

Add `specwork archive <change>` CLI command that safely archives a completed change with user-visible feedback. Also fixes two correctness gaps: renamed `digest.md` output to `summary.md` (aligning with doctor's integrity check), and replaced the tasks.md-only completion guard with a graph-state-aware `checkCompletion()` that reads `state.yaml` node statuses.

## Node Timeline

- **snapshot**: Environment snapshot generated
- **write-tests**: 17 new tests (RED): checkCompletion, summary.md, ArchiveResult, force, CLI archive command
- **impl-1-1**: checkCompletion(root, change) added to src/core/archive.ts — reads state.yaml, falls back to tasks.md
- **impl-1-2**: buildDigest renamed to buildSummary, output filename changed from digest.md to summary.md
- **impl-1-3**: archiveChange() updated to write summary.md, set archived_at in .specwork.yaml, use checkCompletion()
- **impl-2-1**: makeArchiveCommand() created in src/cli/archive.ts with --force flag
- **impl-2-2**: Human-readable output added: archive path, promoted specs, graph/nodes cleanup confirmation
- **impl-2-3**: --json output mode added emitting { change, archive_path, specs_promoted, nodes_cleaned, forced }
- **impl-2-4**: makeArchiveCommand() registered in src/index.ts porcelain section
- **impl-3-1**: Unit tests for checkCompletion() — all complete passes, pending/failed nodes block
- **impl-3-2**: Unit tests for summary.md output — filename, node timeline section, verification table
- **impl-3-3**: Integration tests for specwork archive CLI — success, duplicate destination error, --force with failed nodes
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
| impl-3-1 | PASS |
| impl-3-2 | PASS |
| impl-3-3 | PASS |
| integration | PASS |
