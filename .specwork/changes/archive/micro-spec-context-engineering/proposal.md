## Why

Subagents drift because context is uniform and unanchored to the actual work. Every node receives the same shape of context — full snapshot, all L0 headlines, parent L1 prose, a node prompt — regardless of what the node is trying to accomplish. A test-writer node for auth middleware gets the same context shape as an implementer for the graph walker. Neither knows which spec scenarios they're responsible for, what adjacent nodes are handling, or what "done" looks like in concrete terms.

The result: agents hallucinate scope, duplicate work, and write code that passes their prompt but violates the spec. Token budgets bloat because the full snapshot is always injected even when a node touches three files.

Micro-spec context engineering fixes this by replacing the generic context dump with a curated, node-specific document assembled from facts the system already has:
- Which spec scenarios this node is responsible for
- What parent nodes decided (structured, not prose)
- What sibling nodes own (so this node knows what to avoid)
- What the snapshot looks like in this node's scope only
- What validation rules define success

The token budget goes DOWN, not up, because curated context replaces full dumps.

## What Changes

### New Capabilities

- `micro-spec-composition`: Pre-node assembly composing a `micro-spec.md` from 6 structured sections. Replaces `renderContext()` as the context payload for subagent spawning.

- `structured-l1-extraction`: Post-node summarizer produces `L1-structured.json` alongside `L1.md`. JSON has `{ decisions: string[], contracts: string[], enables: string[], changed: string[] }`. Feeds programmatically into downstream micro-spec composition.

- `spec-slicing`: `GraphNode.specs` is an optional array of `"file.md#ScenarioName"` references. The assembler resolves these to extract only the relevant scenario blocks from spec files, not the full file.

- `sibling-anti-context`: New `getSiblings()` in graph-walker. Sibling scope arrays are rendered as an "Out of Scope" section in the micro-spec, preventing overlap between parallel nodes.

- `snapshot-scope-filtering`: The global snapshot's file-tree section is filtered to entries matching the node's `scope[]` globs. No extra I/O — parsed from existing snapshot markdown.

### Modified Capabilities

- `context-injection`: The `context` field in `node start --json` now contains the micro-spec document instead of `renderContext()` output. The standalone `specwork context assemble` command continues to work for manual/EXPAND use.

- `auto-summarization`: Summarizer agent writes `L1-structured.json` in addition to `L1.md` and `L2.md`. The structured JSON becomes the machine-readable source for downstream composition.

## Impact

| File | Change |
|------|--------|
| `src/types/graph.ts` | Add `specs?: string[]` to `GraphNode` |
| `src/types/context.ts` | Add `StructuredL1`, `MicroSpecBundle` types |
| `src/core/graph-walker.ts` | Add `getSiblings()` |
| `src/core/context-assembler.ts` | Add `filterSnapshot`, `sliceSpecs`, `composeMicroSpec`; `renderContext()` stays but new path used for node spawning |
| `src/core/summarizer.ts` | New module: `writeStructuredL1()` |
| `.claude/agents/specwork-summarizer.md` | Updated prompt to output structured L1 |
| `src/templates/instructions/agents-specwork-summarizer.ts` | Mirror agent def |
| `src/cli/context.ts` | No change to commands; assembly path updated internally |
