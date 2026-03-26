---
description: Run a Foreman workflow autonomously from start to finish
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent, TeamCreate, TeamDelete, TaskCreate, TaskUpdate, SendMessage
---

# Foreman: Go

Run the workflow autonomously for change: $ARGUMENTS

## Steps

1. Run `foreman go $ARGUMENTS --json` to get the execution payload
   - If no graph exists, `go` auto-generates it from tasks.md (check `auto_generated_graph` in response)
2. Check the response status:
   - `ready` — nodes are ready to execute; proceed to step 3
   - `done` — workflow is complete; report summary
   - `blocked` — no runnable nodes; report which nodes are blocked and why
   - `waiting` — nodes are in progress; wait or check back later
3. **Create a team** for this batch: `TeamCreate` with name `exec-<change>-<batch>`
4. For each ready node, create a task (`TaskCreate`) and spawn a teammate:
   - `deterministic`: teammate runs `foreman node start` → command → `foreman node complete`
   - `llm`: teammate runs `foreman node start` → `foreman context assemble` → execute → verify → `foreman node complete`
   - `human`: present output to user, await approval (no teammate needed)
5. Wait for all teammates to complete, then cleanup: `SendMessage` shutdown → `TeamDelete`
6. Run `foreman go $ARGUMENTS --json` again to get the next batch
7. Repeat until status is `done`
8. Report final summary: nodes completed, tests passing, files changed

**Important**: Always use TeamCreate/TeamDelete for every batch, even single-node batches. Never use bare `Agent` calls outside a team boundary.

### Auto-Archive
When the workflow completes successfully (all nodes terminal, change status = complete), `foreman go` automatically archives the change:
- Moves change artifacts to `.foreman/changes/archive/<change>/`
- Preserves graph, state, and all node artifacts (L0/L1/L2, verify.md, qa-report.md)
- Cleans up original directories (changes, graph, nodes)
