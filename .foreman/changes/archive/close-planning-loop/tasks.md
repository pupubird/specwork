## 1. Config and Defaults

- [ ] 1.1 Update `.foreman/config.yaml`: change `parallel_mode` from `sequential` to `parallel` and update the inline comment

## 2. Foreman-Planner Agent Update

- [ ] 2.1 Update `.claude/agents/foreman-planner.md` Phase 1 (Research): document that agent receives a `<planning-context>` block containing spec requirement headers + file tree + snapshot
- [ ] 2.2 Update Phase 1 step list: replace "Read existing specs in `.foreman/specs/`" with "Use spec headers from `<planning-context>`; only read a specific spec file if deep detail is required"
- [ ] 2.3 Update Phase 2 (Generate) and YOLO phase: confirm they reference the pre-assembled context as the starting point for delta-aware spec writing

## 3. Foreman-Plan Slash Command Update

- [ ] 3.1 Update `.claude/commands/foreman-plan.md`: add pre-assembly step after "Create the change" — Grep `.foreman/specs/` for `### Requirement:` headers, read snapshot, bundle into `<planning-context>` block
- [ ] 3.2 Update brainstorm mode spawn: replace bare `Agent` call for research phase with TeamCreate → TaskCreate → teammate spawn → TeamDelete; pass `<planning-context>` block as input
- [ ] 3.3 Update brainstorm mode spawn: replace bare `Agent` call for generate phase with same TeamCreate pattern; pass `<planning-context>` + user answers
- [ ] 3.4 Update YOLO mode spawn: replace bare `Agent` call with TeamCreate pattern; pass `<planning-context>` block as input

## 4. Foreman-Engine Skill Update

- [ ] 4.1 Update `.claude/skills/foreman-engine/SKILL.md` Section 5 (Parallel Execution): remove the "When 3+ nodes ready" conditional — TeamCreate is mandatory for ALL execution batches regardless of node count
- [ ] 4.2 Update Section 5: remove the `parallel_mode` branch that allows sequential without TeamCreate; keep `parallel_mode` only as a hint for whether teammates run concurrently vs one-at-a-time
- [ ] 4.3 Update Section 11 (Quick Reference pseudocode): wrap the execution loop body in TeamCreate/TeamDelete for each batch of ready nodes

## 5. Foreman-Go Slash Command Update

- [ ] 5.1 Update `.claude/commands/foreman-go.md`: replace the bare per-node `Agent` execution loop with TeamCreate-based batch execution (create team → create tasks → spawn teammates → TeamDelete)
- [ ] 5.2 Add `allowed-tools` frontmatter entry for `TeamCreate`, `TeamDelete`, `TaskCreate`, `TaskUpdate`, `SendMessage` to `foreman-go.md`
- [ ] 5.3 Update `.claude/commands/foreman-plan.md` `allowed-tools` frontmatter: add `TeamCreate`, `TeamDelete`, `TaskCreate`, `TaskUpdate`, `SendMessage`
