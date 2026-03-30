## 1. Types and renderer core

- [ ] 1.1 Add VizData type (graph nodes, proposal summary, spec requirements, state) in src/core/viz-renderer.ts
- [ ] 1.2 Implement buildMermaidDiagram() — converts graph.yaml nodes/deps to Mermaid TD syntax with type-based coloring
- [ ] 1.3 Implement extractProposalSummary() — reads proposal.md, extracts WHY section text
- [ ] 1.4 Implement extractSpecRequirements() — reads specs/*.md, extracts ### Requirement headers and their scenarios
- [ ] 1.5 Implement renderHTML() — assembles self-contained HTML with inline CSS, Mermaid CDN, collapsible node panels, spec summary

## 2. CLI command

- [ ] 2.1 Create src/cli/viz.ts with makeVizCommand() — `specwork viz <change>` with --refresh flag
- [ ] 2.2 Register makeVizCommand() in src/index.ts as porcelain command
- [ ] 2.3 Implement open-or-generate logic: open existing overview.html, generate if missing or --refresh passed
- [ ] 2.4 Auto-open in browser via `open` (macOS) / `xdg-open` (Linux)

## 3. Plan skill integration

- [ ] 3.1 Update .claude/commands/specwork-plan.md step 4 to call `specwork viz <change>` after graph generate
