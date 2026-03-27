## 1. Graph Generator and State Layer

- [ ] 1.1 Fix scope extraction in `src/core/graph-generator.ts`: change `extractFilePaths` call to use `task.rawLine` only (remove `allContext` slice), and update fallback from `src/` to `src/${slugify(task.group)}/`
- [ ] 1.2 Add `start_sha: string | null` field to `NodeState` in `src/types/state.ts` and update `defaultNodeState()` in `src/core/state-machine.ts` to initialize it as `null`
- [ ] 1.3 Update `transitionNode` in `src/core/state-machine.ts` to accept `start_sha?: string` in opts and record it on the node state when transitioning to `in_progress` (only on first start, not on retry)

## 2. Verification and Call-Site Wiring

- [ ] 2.1 Add `startSha?: string | null` to `RunChecksOptions` in `src/core/verification.ts`, thread it through `runChecks` → `runSingleCheck` context → `runScopeCheck`, and update `runScopeCheck` to use `git diff --name-only <startSha>` when `startSha` is present
- [ ] 2.2 Update the graph-walker or node-start call site in `src/core/graph-walker.ts` to resolve `git rev-parse HEAD` and pass it as `opts.start_sha` when transitioning a node to `in_progress`, and pass `state.nodes[nodeId].start_sha` into `RunChecksOptions` when calling verification
- [ ] 2.3 Write tests for all three scenarios in `src/__tests__/`: per-task scope extraction with explicit paths, group-slug fallback, start_sha recording in state-machine, and baseline-aware scope-check in verification
