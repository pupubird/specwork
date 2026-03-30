---
description: Run a Specwork workflow autonomously from start to finish
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent, TeamCreate, TeamDelete, TaskCreate, TaskUpdate, SendMessage
---

# Specwork: Go

Run the workflow for change: $ARGUMENTS

1. Run `specwork go $ARGUMENTS --json`
2. Follow `next_action` in the response
3. After each CLI call, follow the new `next_action`
4. Repeat until `status: "done"`

## Patience Rule

**WAIT for teammates to fully finish before evaluating their output.** Teammates work in multiple steps — intermediate messages, partial artifacts, and idle notifications do NOT mean they are done. Only act when you receive their final completion message. Never read artifacts mid-flight and assume the work is incomplete. If unsure whether a teammate is still working, send them a message — do not take over their task.

The CLI guides every step. See the `specwork-engine` skill for details on `next_action` fields.
