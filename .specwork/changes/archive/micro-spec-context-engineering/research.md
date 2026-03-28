## Research Findings

### Current Architecture

**Context assembler** (`src/core/context-assembler.ts`):
- Produces `ContextBundle = { snapshot, l0[], l1[], inputs{}, prompt }`
- `snapshot` = full `.specwork/env/snapshot.md` — not filtered
- `l0` = all completed nodes (headlines only)
- `l1` = direct parents only (free-form prose string)
- `inputs` = files explicitly listed in `graphNode.inputs[]`
- `prompt` = node's prompt string from graph.yaml
- `renderContext()` joins these into a flat markdown string

**L1 is unstructured**: `L1Entry = { nodeId: string; content: string }` — free-form prose, no sections. The summarizer agent writes it as prose with `Files:`, `Exports:`, `Decision:`, `Tests:` labels by convention only. Nothing enforces or parses those sections.

**`scope: string[]` exists but is unused**: `GraphNode.scope` is defined in types and respected by the verifier's `scope-check` validation rule, but the context assembler completely ignores it. Snapshot filtering by scope has no implementation today.

**No `getSiblings` function**: `graph-walker.ts` has `getParents`, `getDescendants`, `getReadyNodes`, `getBlockedNodes`, `topologicalSort` — but no `getSiblings`. "Anti-context from sibling scopes" would require implementing this.

**Spec content is not in the context bundle**: Specs live in `.specwork/changes/<change>/specs/` and `.specwork/specs/`. They're not loaded by `assembleContext` — they'd need to be either added to `inputs[]` in graph.yaml or read separately by a new assembly function.

**`validate: ValidationRule[]` is readable on GraphNode**: Each node has explicit validation rules (`tests-pass`, `tsc-check`, `file-exists`, etc.). These map directly to success criteria and are available to the assembler without extra parsing.

**Micro-spec.md has no home yet**: The `ContextBundle` type and `renderContext()` have no slot for it. It would need either a new field on `ContextBundle` or a new parallel output channel.

**Summarizer is haiku, writes L1 now**: The summarizer agent writes L1 as prose under 100 tokens. Structured L1 (with `decisions`/`contracts`/`enables`/`changed` sections) would change the output format but not necessarily the token budget.

**Token budget context**: Skill says Haiku nodes target <8k, Sonnet <20k, Opus <50k. Full snapshot alone is ~500-2000 tokens. Micro-spec should replace most of the snapshot + prompt, not add on top.

---

## Clarifying Questions

```json
{
  "questions": [
    {
      "id": "q1",
      "question": "Where does micro-spec.md render in the context pipeline?",
      "why": "Currently `assembleContext()` returns a `ContextBundle` and `renderContext()` produces a flat string injected into `node start --json` as `context`. Does micro-spec.md REPLACE renderContext() output (new bundle field replacing snapshot+prompt), ADD as a new `microSpec` field alongside existing fields, or replace the node's `prompt` field entirely?",
      "options": [
        "Replace: micro-spec.md becomes the full context payload (snapshot+L0+L1+prompt replaced by one composed doc)",
        "Additive: add `microSpec` field to ContextBundle alongside existing fields",
        "Slot-in: micro-spec.md replaces only the `prompt` section; rest of bundle unchanged"
      ]
    },
    {
      "id": "q2",
      "question": "Should structured L1 be typed or just a convention?",
      "why": "L1Entry is currently `{ nodeId: string; content: string }`. To programmatically extract `decisions`/`contracts`/`enables`/`changed` for child micro-spec composition, the assembler needs to parse them. Options range from type-safe objects to parsed markdown headers.",
      "options": [
        "Typed object: `L1Entry.content` becomes `{ decisions: string; contracts: string; enables: string; changed: string }` — assembler extracts sections directly",
        "Convention string: keep `content: string`, summarizer writes `## decisions` headers, assembler parses with regex — backward compatible",
        "Separate file: write `L1-structured.json` alongside `L1.md` — L1.md stays human-readable, structured data is machine-readable"
      ]
    },
    {
      "id": "q3",
      "question": "How should spec slicing work for a given node?",
      "why": "There's no existing mechanism to map graph nodes to specific spec scenarios. Specs are in `.specwork/changes/<change>/specs/` but nodes have no `specFile` or tag field. Write-tests nodes should probably see all scenarios; implementers should see only scenarios in their scope.",
      "options": [
        "Node type-based: test-writer gets all spec scenarios, implementers get scenarios filtered by node scope globs",
        "Explicit in graph.yaml: add optional `specs: string[]` field to GraphNode listing which spec files/scenarios to include",
        "Full spec always: include complete spec files for all nodes, rely on scope+anti-context to guide focus"
      ]
    },
    {
      "id": "q4",
      "question": "How should anti-context from siblings work?",
      "why": "`getSiblings` doesn't exist in graph-walker.ts and would need to be implemented. Beyond the missing function, it's unclear what 'anti-context' should look like in the micro-spec — a 'do not touch' list, the sibling's scope array, or something else.",
      "options": [
        "Scope exclusion list: collect sibling `scope[]` arrays and render as '## Do Not Touch' section in micro-spec",
        "Skip it for v1: sibling anti-context adds complexity without clear ROI — defer until needed",
        "Outputs-based: list sibling `outputs[]` (files they will write) as the anti-context boundary"
      ]
    },
    {
      "id": "q5",
      "question": "How should snapshot filtering by scope work?",
      "why": "The snapshot is a single flat markdown file (~500-2000 tokens). `GraphNode.scope` is an array of glob patterns (used by scope-check verifier) but currently ignored by context assembly. Filtering could mean different things.",
      "options": [
        "File-tree filter: parse snapshot markdown, keep only file tree entries matching scope globs",
        "Re-run snapshot scoped: generate a mini-snapshot by reading only files matching scope (more accurate but adds latency)",
        "Skip snapshot filtering for v1: micro-spec adds focused context but full snapshot stays; savings come from replacing prompt bloat"
      ]
    }
  ]
}
```
