## 1. Planner Agent

- [ ] 1.1 Create `.claude/agents/foreman-planner.md` — agent that researches codebase, asks clarifying questions, generates change artifacts
- [ ] 1.2 Add `--yolo` flag to `src/cli/plan.ts` — outputs `mode: "yolo" | "brainstorm"` in JSON

## 2. Go Command Enhancement

- [ ] 2.1 Update `src/cli/go.ts` — auto-run `graph generate` if no graph.yaml exists
- [ ] 2.2 Add tests for auto-graph-generation in go command

## 3. Slash Commands

- [ ] 3.1 Update `.claude/commands/foreman-plan.md` — orchestrate two-phase planner flow
- [ ] 3.2 Update `.claude/commands/foreman-go.md` — document auto-graph behavior
