## 1. Types and renderer core

- [x] 1.1 Add VizData type (graph nodes, proposal summary, spec requirements, state) in src/core/viz-renderer.ts
- [x] 1.2 Implement buildMermaidDiagram() — converts graph.yaml nodes/deps to Mermaid TD syntax with type-based coloring
- [x] 1.3 Implement extractProposalSummary() — reads proposal.md, extracts WHY section text
- [x] 1.4 Implement extractSpecRequirements() — reads specs/*.md, extracts ### Requirement headers and their scenarios
- [x] 1.5 Implement renderHTML() — assembles self-contained HTML with inline CSS, Mermaid CDN, collapsible node panels, spec summary

## 2. CLI command

- [x] 2.1 Create src/cli/viz.ts with makeVizCommand() — `specwork viz <change>` with --refresh flag
- [x] 2.2 Register makeVizCommand() in src/index.ts as porcelain command
- [x] 2.3 Implement open-or-generate logic: open existing overview.html, generate if missing or --refresh passed
- [x] 2.4 Auto-open in browser via `open` (macOS) / `xdg-open` (Linux)

## 3. Plan skill integration

- [x] 3.1 Update .claude/commands/specwork-plan.md step 4 to call `specwork viz <change>` after graph generate
