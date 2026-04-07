# Proposal: Fix Specwork Graph Generation and Validation Reliability

## Problem

Specwork workflows fail at validation time due to four systemic issues:

1. **Empty scopes**: `specwork graph generate` warns "no file paths found" for every impl node because `extractFilePaths` only scans the checkbox line (`t.rawLine`), ignoring sub-bullet descriptions where file paths typically appear. The `allContext` variable built at line 93 of graph-generator.ts is dead code.

2. **tsc-check false failures**: `runTscCheck` (verification.ts:267-289) runs `tsc --noEmit` on the entire project. With pre-existing type errors, every node fails validation regardless of whether the node introduced any errors.

3. **tests-pass false failures**: `runTestsPass` (verification.ts:326-349) runs the full test suite. With 47+ pre-existing test failures, nodes fail due to unrelated tests. The `verification.md` spec already defines `args.file` for scoped execution, but the graph generator never populates it.

4. **File ownership conflicts**: `graph-validator.ts` checks cycles, duplicates, missing deps, and empty scopes — but never checks if two nodes have overlapping `scope` arrays. When two impl nodes modify the same file, scope-check cross-contaminates.

## Solution

| Issue | Fix | Decision Rationale |
|-------|-----|-------------------|
| Empty scopes | Scan sub-bullet lines below checkboxes for file paths | Catches paths in natural task formatting without over-scanning proposal/design |
| tsc-check | Baseline snapshot: capture tsc errors at `start_sha`, fail only on NEW errors | Leverages existing `start_sha` infrastructure; most accurate error isolation |
| tests-pass | Wire write-tests node outputs into impl `tests-pass` args.file | Write-tests already knows which files it created; single source of truth |
| Overlap | Warn on overlapping scopes during graph generation | Non-blocking; lets authors fix manually without breaking existing workflows |

## Scope

| In Scope | Out of Scope |
|----------|-------------|
| `extractFilePaths` sub-bullet scanning | Rewriting entire graph generator |
| Baseline-aware tsc-check via `start_sha` | Fixing pre-existing type errors |
| Scoped tests-pass via write-tests outputs | Fixing pre-existing test failures |
| Overlap warning in graph-validator | Blocking overlaps (error-level) |
| Remove dead `allContext` code | Worktree isolation for parallel nodes |

## Success Criteria

- `specwork graph generate` produces nodes with non-empty scopes when file paths appear in sub-bullets
- tsc-check passes for nodes that don't introduce new type errors, even with pre-existing errors
- tests-pass only runs tests relevant to the node's scope
- `specwork graph generate` warns when two nodes share scope files
