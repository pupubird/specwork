---
description: Execute a Foreman workflow graph for a change
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent
---

# Foreman: Run workflow

Execute the Foreman workflow for change: $ARGUMENTS

## Steps

1. Run `foreman run $ARGUMENTS --json` to get the next ready node(s)
2. For each ready node, follow the foreman-engine skill execution loop:
   - `deterministic`: run the command, then `foreman node complete $ARGUMENTS <node-id>`
   - `llm`: `foreman node start` → `foreman context assemble` → spawn subagent → `foreman node complete`
   - `human`: present output to user, then `foreman node complete` or `foreman node fail`
3. Loop back to step 1 until `foreman run $ARGUMENTS --json` returns `status: "done"`
4. Report final summary: nodes completed, tests passing, files changed
