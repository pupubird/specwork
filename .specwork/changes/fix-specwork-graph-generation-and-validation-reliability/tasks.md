## 1. Sub-Bullet Scope Extraction

- [ ] 1.1 Extend `parseTasks` to capture indented sub-bullet lines below each checkbox, add `subLines` to `ParsedTask`, and update scope extraction to use `rawLine + subLines` as input to `extractFilePaths`
  - `src/core/graph-generator.ts` — add `subLines: string[]` to `ParsedTask`, update parser loop, update scope calls at lines 156, 177, 198
- [ ] 1.2 Remove dead `allContext` variable and unused `proposalContent`/`designContent` reads from `generateGraph`
  - `src/core/graph-generator.ts` — remove lines 88-93

## 2. Baseline-Aware tsc-check

- [ ] 2.1 Extend `runTscCheck` to accept `scope` and `startSha` params, capture baseline errors at `startSha` via git checkout, diff against current errors, and only fail on new errors not in baseline
  - `src/core/verification.ts` — modify `runTscCheck` signature, add baseline capture logic, add error set diffing, add fallback chain (baseline → scope-filter → full)
- [ ] 2.2 Update `runSingleCheck` dispatcher to pass `context.scope` and `context.startSha` through to `runTscCheck`
  - `src/core/verification.ts` — modify `case 'tsc-check':` at line 197 to forward context params

## 3. Scoped tests-pass Validation

- [ ] 3.1 Add `deriveTestFiles` function that maps source file paths to test file paths using `src/<path>/<name>.ts` → `src/__tests__/<path>/<name>.test.ts` convention
  - `src/core/graph-generator.ts` — add `deriveTestFiles(scopePaths: string[]): string[]` function
- [ ] 3.2 Wire `deriveTestFiles` into impl node generation so the `tests-pass` validation rule gets `args.file` populated with derived test paths
  - `src/core/graph-generator.ts` — update `validate` array construction in grouped node block (line 153), single node block (line 175), and isolated node block (line 197)

## 4. Scope Overlap Detection

- [ ] 4.1 Add scope overlap detection to `validateGraph` that checks for exact path duplicates and prefix containment between LLM nodes, emitting warnings (not errors)
  - `src/core/graph-validator.ts` — add overlap check loop after existing validation passes, build scope-to-nodes map, detect exact and prefix overlaps
