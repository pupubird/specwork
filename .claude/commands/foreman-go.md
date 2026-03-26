---
description: Run a Foreman workflow autonomously from start to finish
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent, TeamCreate, TeamDelete, TaskCreate, TaskUpdate, SendMessage
---

# Foreman: Go

Run the workflow for change: $ARGUMENTS

1. Run `foreman go $ARGUMENTS --json`
2. Follow `next_action` in the response
3. After each CLI call, follow the new `next_action`
4. Repeat until `status: "done"`

The CLI guides every step. See the `foreman-engine` skill for details on `next_action` fields.
