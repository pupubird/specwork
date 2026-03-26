---
description: Run a Foreman workflow autonomously from start to finish
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent
---

# Foreman: Go

Run the workflow autonomously for change: $ARGUMENTS

## Steps

1. Run `foreman go $ARGUMENTS --json` to get the execution payload
2. Check the response status:
   - `ready` — nodes are ready to execute; follow the foreman-engine skill execution loop
   - `done` — workflow is complete; report summary
   - `blocked` — no runnable nodes; report which nodes are blocked and why
   - `waiting` — nodes are in progress; wait or check back later
3. For each ready node, follow the foreman-engine skill:
   - `deterministic`: run the command, then `foreman node complete $ARGUMENTS <node-id>`
   - `llm`: `foreman node start` → `foreman context assemble` → spawn subagent → verify → `foreman node complete`
   - `human`: present output to user, await approval
4. After each node completes, run `foreman go $ARGUMENTS --json` again to get the next batch
5. Repeat until status is `done`
6. Report final summary: nodes completed, tests passing, files changed
