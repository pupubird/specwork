## Context

After `specwork plan` completes (brainstorm or yolo mode), the planner generates proposal.md, design.md, tasks.md, specs/, and then `specwork graph generate` produces graph.yaml. The user must review all of this before approving `specwork go`. Currently this means reading 4+ markdown files and a YAML graph definition — there is no unified visual review.

## Goals / Non-Goals

**Goals:**
- Single interactive HTML page showing DAG + proposal + specs per node
- Auto-generated after planning, before `go` approval
- Standalone `specwork viz <change>` command for re-viewing
- Deterministic renderer (no LLM call) with content from planning artifacts
- Auto-opens in default browser

**Non-Goals:**
- Live updating during `specwork go` execution (future enhancement)
- Custom themes or user-configurable layouts
- Server-based rendering (must be a single self-contained HTML file)

## Decisions

### Decision: Hybrid Renderer (deterministic structure + artifact content)

A pure LLM approach would add latency and cost to every plan. A pure template would be too rigid. The hybrid approach uses a deterministic TypeScript function to generate the HTML structure (DAG layout via Mermaid.js CDN, CSS panels, collapsible sections) and injects content extracted from the planning artifacts (proposal text, spec requirements, node descriptions). No LLM call required.

### Decision: Single Self-Contained HTML File

The output is one `overview.html` file with all CSS/JS inline and Mermaid.js loaded from CDN. No build step, no dependencies, works in any browser. Saved to `.specwork/changes/<name>/overview.html`.

### Decision: Smart Re-open with --refresh

`specwork viz <change>` opens existing `overview.html` if it exists. Pass `--refresh` to regenerate from current graph.yaml + state.yaml. This avoids unnecessary regeneration while allowing updates after graph edits.

### Decision: Plan Skill Trigger

Viz generation is triggered from the plan skill (specwork-plan.md step 4) after `specwork graph generate`, not as a side effect of graph generation itself. This keeps the CLI commands orthogonal and only auto-triggers during the planning flow.

## Architecture

### HTML Structure

```
overview.html
├── Header: change name, description, created date
├── Proposal Panel: WHY section from proposal.md
├── DAG Graph: Mermaid.js rendering of graph.yaml
│   ├── Nodes colored by type (snapshot=gray, write-tests=blue, impl=green, integration=purple)
│   ├── Group nodes show sub_tasks count badge
│   └── Edges from deps[]
├── Node Detail Panel (click to expand):
│   ├── Type, agent/command, scope
│   ├── Sub-tasks (if group node)
│   ├── Spec requirements mapped to this node
│   └── Dependencies listed
└── Specs Summary: all spec requirements grouped by file
```

### Renderer Pipeline

```
readGraph(graph.yaml) + readProposal(proposal.md) + readSpecs(specs/*.md) + readState(state.yaml)
    → buildMermaidDiagram(graph)
    → extractProposalSummary(proposal)
    → extractSpecRequirements(specs)
    → mapSpecsToNodes(graph, specs)
    → renderHTML(diagram, summary, specs, nodeDetails)
    → write overview.html
    → open in browser
```

### CLI Command

```
specwork viz <change>           # opens existing overview.html (or generates if missing)
specwork viz <change> --refresh # regenerates from current artifacts before opening
```

### Spec-to-Node Mapping

Nodes in graph.yaml have a `specs` field (from micro-spec-composition) that maps node IDs to spec scenarios. The renderer uses this to show which spec requirements apply to each node. If no `specs` field exists, specs are shown in a global summary panel only.

## Risks / Trade-offs

- [Mermaid CDN dependency] → Works offline if cached; fallback to ASCII if CDN unreachable is NOT implemented (acceptable for dev tool)
- [Large graphs may render slowly] → Mermaid handles 50+ nodes fine; specwork graphs are typically 5-15 nodes
- [Stale overview.html] → Mitigated by `--refresh` flag and auto-generation during plan flow

## Open Questions

None — all decisions resolved during planning.
