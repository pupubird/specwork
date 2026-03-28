## Architecture Overview

Micro-spec context engineering introduces two phases that connect through `L1-structured.json`:

```
Post-node (summarizer):                Pre-node (assembler):
  verify pass                            node start --json
  → summarizer agent                     → composeMicroSpec()
    writes L1-structured.json              reads L1-structured.json from parents
    writes L1.md (unchanged)              slices specs via node.specs[]
    writes L2.md (unchanged)              filters snapshot by node.scope[]
                                          collects sibling scope via getSiblings()
                                          expands validate[] to human text
                                          → returns micro-spec string
                                          → injected as `context` in response
```

The micro-spec string **replaces** `renderContext()` in the node start path. `renderContext()` is kept for `specwork context assemble` (manual/EXPAND use) but is no longer the primary context channel.

---

## Goals / Non-Goals

**Goals:**
- Replace generic context dumps with node-specific curated micro-spec documents
- Reduce token budgets through spec slicing + snapshot scope filtering
- Give downstream nodes programmatic access to parent decisions via typed JSON

**Non-Goals:**
- Changing the L2/EXPAND mechanism
- Modifying the verifier, graph generator, or archive behavior
- Altering how `specwork context assemble` works for manual use

---

## New Types (`src/types/context.ts`)

```typescript
export interface StructuredL1 {
  decisions: string[];  // choices made and why
  contracts: string[];  // exported types/functions with signatures
  enables: string[];    // what downstream nodes can now do
  changed: string[];    // file paths modified or created
}

export interface MicroSpecBundle {
  objective: string;
  specScenarios: string;
  parentDecisions: string;
  outOfScope: string[];
  relevantFiles: string;
  successCriteria: string[];
}
```

## New Field (`src/types/graph.ts`)

```typescript
export interface GraphNode {
  // ... existing fields ...
  specs?: string[];   // optional: ["file.md#ScenarioName"] references
}
```

---

## New Functions

### `getSiblings(graph, nodeId): string[]`  — `src/core/graph-walker.ts`

Nodes sharing ≥1 common parent with `nodeId`, excluding `nodeId` itself and its ancestors:

```
siblings = union { n.id | n.deps ∩ node.deps ≠ ∅ } − {nodeId} − ancestors(nodeId)
```

### `filterSnapshot(snapshot, scope): string`  — `src/core/context-assembler.ts`

Parse snapshot line by line. Track file-tree sections (detect by heading pattern). Within tree sections, only emit lines whose path token matches ≥1 glob in `scope[]` using `minimatch`. Non-tree lines pass through. If `scope` is empty, return snapshot unchanged.

### `sliceSpecs(root, change, refs): string`  — `src/core/context-assembler.ts`

For each `"file.md#ScenarioName"` ref:
1. Parse filename and optional anchor
2. Search `.specwork/changes/<change>/specs/` then `.specwork/specs/`
3. No anchor → full file content
4. Anchor → extract `#### Scenario: <anchor>` block through next `####` or EOF
5. Missing file → `<!-- spec not found: <filename> -->`
6. Missing scenario → `<!-- scenario not found: <anchor> in <filename> -->`

### `getStructuredL1(root, change, nodeId): StructuredL1 | null`  — `src/core/context-assembler.ts`

Read `.specwork/nodes/<change>/<nodeId>/L1-structured.json`. Return parsed object or `null` if absent.

### `expandValidate(rules): string[]`  — `src/core/context-assembler.ts`

Map each `ValidationRule` to human-readable text:
- `tests-pass` → `"All tests must pass"`
- `tsc-check` → `"TypeScript must compile without errors"`
- `file-exists { path }` → `"File <path> must exist"`
- `files-unchanged { paths }` → `"Files <paths> must not be modified"`
- Unknown → `"<type>: <JSON args>"`

### `composeMicroSpec(root, change, nodeId): string`  — `src/core/context-assembler.ts`

```
1. Load graph + state
2. Find graphNode
3. objective = node.description
4. specScenarios = sliceSpecs(root, change, node.specs ?? [])
5. parentIds = getParents(graph, nodeId)
6. parentDecisions = parentIds
     .map(id => getStructuredL1(root, change, id))
     .filter(Boolean)
     .flatMap(l1 => [...l1.decisions, ...l1.contracts])
7. siblingIds = getSiblings(graph, nodeId)
8. outOfScope = siblingIds.flatMap(id => getNode(graph, id)?.scope ?? [])
9. snapshot = readMarkdown(snapshotPath(root))
10. relevantFiles = filterSnapshot(snapshot, node.scope ?? [])
11. successCriteria = expandValidate(node.validate)
12. render sections, omitting empty ones
```

---

## Storage

| Artifact | Location | Durability |
|----------|----------|------------|
| `L1-structured.json` | `.specwork/nodes/<change>/<node>/L1-structured.json` | Durable — committed with node |
| `L1.md` | `.specwork/nodes/<change>/<node>/L1.md` | Durable — unchanged |
| Micro-spec | In-memory string only | Ephemeral — not written to disk |

---

## Decisions

### Decision: Micro-spec replaces renderContext() in node start path

`renderContext()` produces a generic flat dump with no behavioral anchoring. Replacing it with `composeMicroSpec()` in the node start path while keeping `renderContext()` for manual/EXPAND use gives maximum backward compatibility without branching the CLI surface.

### Decision: L1-structured.json alongside L1.md, not replacing it

L1.md remains human-readable in the file browser. L1-structured.json is the machine-readable counterpart read programmatically by the assembler. This avoids a migration cliff for existing completed nodes.

### Decision: minimatch for scope glob filtering (not micromatch)

The codebase is a Node.js/TypeScript project. `minimatch` is already a common transitive dependency and handles the `**` glob patterns used in `scope[]` fields. No new dep needed in most cases; if absent, add as direct dep.

### Decision: filterSnapshot operates on markdown lines, not file I/O

Re-running the snapshot generator per node would add latency and require the snapshot to be re-runnable on demand. Parsing the existing `snapshot.md` string is stateless, fast, and has no side effects. The tradeoff is that filtering accuracy depends on the snapshot format being consistent (file tree lines identifiable by indentation/path pattern).

---

## Risks / Trade-offs

- **Snapshot format coupling** — `filterSnapshot` must detect file-tree sections by markdown heading. If `specwork-snapshot` changes its output format, filtering breaks silently (returns full snapshot). Mitigation: integration test with a fixed snapshot fixture.
- **getSiblings can over-broaden** — nodes sharing a common root ancestor are technically siblings by the definition. Exclude ancestors explicitly (already in spec). Mitigation: unit tests covering diamond-shaped graphs.
- **L1-structured.json absent for old nodes** — completed nodes from before this change have no structured L1. Assembler falls back gracefully (omits section). Mitigation: spec scenario covers this explicitly.
