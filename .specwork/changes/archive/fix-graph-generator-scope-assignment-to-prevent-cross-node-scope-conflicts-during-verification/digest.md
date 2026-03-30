# Summary: fix-graph-generator-scope-assignment-to-prevent-cross-node-scope-conflicts-during-verification

**Archived:** 2026-03-27 | **Nodes:** 9 | **Status:** complete

## Summary

Fix two root causes of false-positive scope-check failures in parallel/sequential node execution: (1) graph generator now extracts scope from the individual task line only (not the shared context blob), with a group-slug fallback instead of the entire `src/` tree; (2) scope-check verification now uses a per-node git baseline SHA recorded when the node first transitions to `in_progress`, preventing sibling nodes' changes from polluting the diff.

## Node Timeline

- **snapshot**: Environment snapshot generated
- **write-tests**: Tests written for per-task scope extraction, group-slug fallback, start_sha state recording, and baseline-aware scope-check
- **impl-1-1**: extractFilePaths call in graph-generator.ts changed to task.rawLine only; fallback updated to src/<group-slug>/
- **impl-1-2**: start_sha: string | null added to NodeState in src/types/state.ts; defaultNodeState() initializes it as null
- **impl-1-3**: transitionNode in state-machine.ts accepts start_sha? in opts and records it on first in_progress transition only
- **impl-2-1**: startSha? added to RunChecksOptions; threaded through runChecks → runSingleCheck → runScopeCheck; uses git diff --name-only <startSha> when present
- **impl-2-2**: graph-walker.ts resolves git rev-parse HEAD before transitioning node to in_progress and passes start_sha; verification passes state.nodes[nodeId].start_sha into RunChecksOptions
- **impl-2-3**: Tests for all three scenarios: per-task scope extraction, group-slug fallback, start_sha state recording, baseline-aware scope-check
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
| integration | PASS |
