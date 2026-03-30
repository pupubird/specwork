## Why

After `specwork plan` completes, the user is left with a wall of terminal text — a table of graph nodes and a Mermaid diagram printed inline. Before committing to `specwork go`, there's no easy way to review the full plan: what each node does, which specs drive it, what the change is actually trying to accomplish. Users have to mentally reconstruct the plan from multiple text files.

This change adds an auto-generated HTML page (`overview.html`) that renders immediately in the browser after planning completes — a visual, interactive planning review artifact. It shows the DAG, the change proposal (WHY), and the spec requirements mapped to each node, so the user can review the full scope of a change in one place before approving execution.

## What Changes

### New Capabilities

- `plan-visualization`: A deterministic TypeScript renderer (`src/cli/viz.ts`) that reads `graph.yaml`, `proposal.md`, and `specs/` from a change directory and produces a self-contained HTML file at `.specwork/changes/<change>/overview.html`. The HTML embeds Mermaid.js for DAG rendering and presents proposal content and spec requirements alongside the graph.

- `specwork viz <change>`: A new top-level CLI command that opens an existing `overview.html` in the browser. Accepts `--refresh` to regenerate from current artifacts before opening.

### Modified Capabilities

- `specwork-plan` skill: Step 4 gains a new sub-step — after `specwork graph generate` and `specwork graph show`, it calls `specwork viz <change>` to generate and auto-open the visualization.

## Impact

- No changes to existing graph generation or execution logic.
- `specwork-plan.md` gains one additional step.
- `src/index.ts` gains one new porcelain command registration.
- New file: `src/cli/viz.ts`.
