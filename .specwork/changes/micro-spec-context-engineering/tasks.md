## 1. Types and Interfaces

- [x] 1.1 Add `StructuredL1` interface to `src/types/context.ts`: `{ decisions: string[], contracts: string[], enables: string[], changed: string[] }`
- [ ] 1.2 Add `MicroSpecBundle` interface to `src/types/context.ts`: `{ objective, specScenarios, parentDecisions, outOfScope, relevantFiles, successCriteria }`
- [x] 1.3 Add optional `specs?: string[]` field to `GraphNode` in `src/types/graph.ts`

## 2. Graph Walker Extension

- [x] 2.1 Implement `getSiblings(graph, nodeId): string[]` in `src/core/graph-walker.ts` — returns nodes sharing ≥1 common parent, excluding self and ancestors

## 3. Spec Slicing

- [x] 3.1 Implement `sliceSpecs(root, change, refs): string` in `src/core/context-assembler.ts` — resolves `"file.md#ScenarioName"` references, returns concatenated scenario blocks with warning comments for missing refs

## 4. Snapshot Filtering

- [x] 4.1 Implement `filterSnapshot(snapshot, scope): string` in `src/core/context-assembler.ts` — parses snapshot markdown, filters file-tree lines by scope globs using minimatch, preserves non-tree sections

## 5. Structured L1 Read/Write

- [x] 5.1 Implement `getStructuredL1(root, change, nodeId): StructuredL1 | null` in `src/core/context-assembler.ts` — reads `L1-structured.json`, returns null if absent
- [ ] 5.2 Implement `writeStructuredL1(root, change, nodeId, data: StructuredL1): void` in `src/core/summarizer.ts` (new module) — writes `L1-structured.json` to node artifact dir
- [x] 5.3 Add `expandValidate(rules: ValidationRule[]): string[]` in `src/core/context-assembler.ts` — maps each rule type to human-readable success criterion text

## 6. Micro-Spec Composer

- [x] 6.1 Implement `composeMicroSpec(root, change, nodeId): string` in `src/core/context-assembler.ts` — orchestrates all prior functions into a rendered micro-spec document, omitting empty sections

## 7. Summarizer Agent Update

- [x] 7.1 Update `.claude/agents/specwork-summarizer.md` to include instructions for writing `L1-structured.json` with `decisions`, `contracts`, `enables`, and `changed` arrays
- [ ] 7.2 Update `src/templates/instructions/agents-specwork-summarizer.ts` to mirror the updated agent definition

## 8. Tests

- [x] 8.1 Add unit tests for `getSiblings` in `src/__tests__/core/graph-walker.test.ts` — cover shared parent, no siblings, ancestor exclusion, diamond graph
- [ ] 8.2 Add unit tests for `filterSnapshot` in `src/__tests__/core/context-assembler.test.ts` — cover scope match, empty scope, multi-glob, non-tree preservation, empty result
- [x] 8.3 Add unit tests for `sliceSpecs` in `src/__tests__/core/context-assembler.test.ts` — cover single scenario, full file, multiple refs, missing file, missing anchor
- [ ] 8.4 Add unit tests for `getStructuredL1` and `expandValidate` in `src/__tests__/core/context-assembler.test.ts`
- [x] 8.5 Add unit tests for `composeMicroSpec` in `src/__tests__/core/context-assembler.test.ts` — cover full composition, missing optional data, backward compat with no specs/scope/structured-L1
