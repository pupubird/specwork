## 1. Plan Command

- [ ] 1.1 Create `src/cli/plan.ts` — accepts description string, calls `foreman new` internally, outputs JSON payload with change name + file paths + description for engine skill
- [ ] 1.2 Add tests for plan command in `src/__tests__/cli/plan.test.ts`

## 2. Go Command

- [ ] 2.1 Create `src/cli/go.ts` — accepts change name, validates graph exists, outputs execution payload JSON for engine skill to consume autonomously
- [ ] 2.2 Add tests for go command in `src/__tests__/cli/go.test.ts`

## 3. Enhanced Status

- [ ] 3.1 Enhance `src/cli/status.ts` — when no change specified, scan all active changes and show summary table
- [ ] 3.2 Add tests for multi-change status in existing status test file

## 4. CLI Reorganization

- [ ] 4.1 Reorganize `src/index.ts` — group porcelain commands (plan, go, status, init) at top, plumbing commands under "Advanced" help section
- [ ] 4.2 Update README.md quick start to focus on 3 porcelain commands
- [ ] 4.3 Add/update Claude Code slash command for `foreman-plan`
