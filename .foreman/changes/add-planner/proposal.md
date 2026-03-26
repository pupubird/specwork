## Why

`foreman plan` currently creates empty template files and leaves the user to fill them in manually. This makes "plan" just a glorified `mkdir`. The real value is in an interactive brainstorming flow: the planner agent reads the codebase, identifies context, asks clarifying questions, then generates all artifacts from the answers.

The result: a developer describes what they want in one sentence, answers a few targeted questions, and gets a complete change with proposal, specs, design, tasks, and graph — ready for `foreman go`.

## What Changes

1. **New `foreman-planner` agent** — reads codebase, asks clarifying questions, generates change artifacts
2. **`--yolo` flag on `foreman plan`** — skip questions, planner generates everything from description alone
3. **`foreman go` auto-generates graph** — if no graph.yaml exists, runs `graph generate` before starting execution
4. **Updated `foreman-plan` slash command** — orchestrates the two-phase planner flow (research → ask → generate)

## Capabilities

### New Capabilities
- `planner-agent`: Agent that researches codebase and generates change artifacts from user intent

### Modified Capabilities
- `plan-command`: Add `--yolo` flag for skip-questions mode, output `mode` field in JSON
- `go-command`: Auto-generate graph if missing before starting execution

## Impact

- `.claude/agents/foreman-planner.md` — new agent definition
- `src/cli/plan.ts` — add `--yolo` flag
- `src/cli/go.ts` — auto-generate graph
- `.claude/commands/foreman-plan.md` — orchestrate planner flow
- `.claude/commands/foreman-go.md` — update to include graph generation
