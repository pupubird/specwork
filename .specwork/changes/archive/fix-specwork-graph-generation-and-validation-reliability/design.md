# Design: Fix Specwork Graph Generation and Validation Reliability

## Architecture

Four independent fixes, each touching distinct functions. No new modules or exported types. All changes are backward-compatible.

---

### 1. Sub-Bullet Scope Extraction (`src/core/graph-generator.ts`)

**Current**: `parseTasks` captures only the checkbox line as `rawLine`. `extractFilePaths` is called on `rawLine` only. The `allContext` variable (line 93) combining tasks+proposal+design is dead code.

**Change**:

1. Add `subLines: string[]` to the internal `ParsedTask` interface
2. In the parser loop, after matching a checkbox line, collect subsequent indented lines (2+ spaces or tab prefix) until hitting a non-indented line, another checkbox, or a section header
3. When computing scope, pass `[t.rawLine, ...t.subLines].join('\n')` to `extractFilePaths`
4. Remove `allContext`, `proposalContent`, and `designContent` reads (only used to build `allContext`)

```typescript
interface ParsedTask {
  // ... existing fields
  subLines: string[];  // indented lines below the checkbox
}

// Scope extraction becomes:
const allText = [t.rawLine, ...t.subLines].join('\n');
const scope = extractFilePaths(allText);
```

**The existing `extractFilePaths` regex** (`/(?:^|\s)((?:src|lib|test|tests|__tests__|bin|scripts)\/[\w/.-]+\.\w+)/gm`) works unchanged — it already handles multiline input via the `gm` flags.

---

### 2. Baseline-Aware tsc-check (`src/core/verification.ts`)

**Current**: `runTscCheck(root, start)` runs `tsc --noEmit`, fails on any error.

**Change**: Extend signature to `runTscCheck(root, start, scope?, startSha?)`.

When `startSha` is available:
1. Run `tsc --noEmit` on current working tree → collect current errors via `parseTscErrors`
2. Run `git stash --include-untracked && git checkout <startSha>` to get baseline state
3. Run `tsc --noEmit` → collect baseline errors via `parseTscErrors`
4. Run `git checkout - && git stash pop` to restore working tree
5. Diff: errors in current set but NOT in baseline set → "new errors"
6. If no new errors → PASS; if new errors → FAIL (only new errors reported)

**Error identity key**: `${file}::${code}::${normalizedMessage}` where `normalizedMessage` strips line numbers. This handles line shifts from other changes while still matching the same underlying error.

**Fallback chain**:
- `startSha` available + git ops succeed → baseline diff (most accurate)
- `startSha` available + git ops fail → filter errors to `scope` files only
- `startSha` null → filter errors to `scope` files only
- `scope` empty → current behavior (fail on any error)

**Dispatcher update**: The `case 'tsc-check':` in `runSingleCheck` already receives `context` with `scope` and `startSha` — pass them through:

```typescript
case 'tsc-check':
  return runTscCheck(root, start, context?.scope, context?.startSha);
```

---

### 3. Scoped tests-pass via Write-Tests Outputs (`src/core/graph-generator.ts`)

**Current**: Graph generator creates `tests-pass` rules without `args.file`. Full suite runs.

**Change**: Add a `deriveTestFiles` function and wire it into impl node generation.

```typescript
function deriveTestFiles(scopePaths: string[]): string[] {
  return scopePaths
    .filter(p => !p.includes('__tests__') && p.endsWith('.ts'))
    .map(p => p.replace(/^src\//, 'src/__tests__/').replace(/\.ts$/, '.test.ts'));
}
```

In the impl node creation blocks (grouped and isolated), replace the static `tests-pass` rule:

```typescript
// Before
{ type: 'tests-pass' }

// After
const testFiles = deriveTestFiles(scope);
{ type: 'tests-pass', ...(testFiles.length > 0 ? { args: { file: testFiles.join(' ') } } : {}) }
```

When `deriveTestFiles` returns empty (no mappable paths), the rule has no `args.file` — full suite runs as fallback. This maintains backward compatibility.

The `write-tests` node's `outputs: ['src/__tests__/']` declaration is preserved as documentation. The actual test file paths are derived from impl scope at generation time.

---

### 4. Scope Overlap Detection (`src/core/graph-validator.ts`)

**Current**: No check for overlapping scopes.

**Change**: After existing validation passes, add overlap detection for LLM nodes:

```typescript
// Exact overlap: same path claimed by multiple nodes
const scopeOwners = new Map<string, string[]>();
for (const node of graph.nodes) {
  if (node.type !== 'llm') continue;
  for (const s of node.scope) {
    const owners = scopeOwners.get(s) ?? [];
    owners.push(node.id);
    scopeOwners.set(s, owners);
  }
}
for (const [path, owners] of scopeOwners) {
  if (owners.length > 1) {
    warnings.push(`Scope overlap: "${path}" claimed by nodes: ${owners.join(', ')}`);
  }
}

// Prefix containment: src/core/ contains src/core/foo.ts
for (const nodeA of graph.nodes) {
  if (nodeA.type !== 'llm') continue;
  for (const nodeB of graph.nodes) {
    if (nodeB.type !== 'llm' || nodeA.id >= nodeB.id) continue;
    for (const sa of nodeA.scope) {
      for (const sb of nodeB.scope) {
        if (sa !== sb && (sb.startsWith(sa) || sa.startsWith(sb))) {
          warnings.push(`Scope containment: "${sa}" (${nodeA.id}) overlaps "${sb}" (${nodeB.id})`);
        }
      }
    }
  }
}
```

**Severity**: Warning only. Does not set `valid: false`.

---

## Data Model

No changes to exported types (`GraphNode`, `Graph`, `ValidationRule`). Only internal `ParsedTask` gets `subLines: string[]`.

## Risks

| Risk | Mitigation |
|------|-----------|
| Baseline tsc capture is slow (extra tsc run + git checkout) | Cache baseline per `startSha`; fallback to scope-filter if git ops fail |
| Git stash/checkout corrupts working tree | Use try/finally to always restore; fall back to scope-filter on failure |
| Test file convention doesn't match all projects | Fallback to full suite when no mapping found |
| Sub-bullet parsing picks up non-path content | `extractFilePaths` regex already filters for valid path patterns |
| Scope overlap warnings are noisy for shared types | Only warn for LLM nodes; skip deterministic/human nodes |
