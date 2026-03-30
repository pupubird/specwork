---
description: Run a Specwork workflow autonomously from start to finish
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent, TeamCreate, TeamDelete, TaskCreate, TaskUpdate, SendMessage
---

# Specwork: Go

Run the workflow for change: $ARGUMENTS

## Execution Loop

1. Run `specwork go $ARGUMENTS --json`
2. Follow `next_action` in the response
3. After each CLI call, follow the new `next_action`
4. Repeat until `status: "done"`

## Verification Protocol

After every teammate finishes work, **you** (the lead) must verify before completing:

```
teammate finishes → you run: specwork node verify <change> <node> --json
                  → verdict PASS → specwork node complete <change> <node> --l0 "<summary>"
                  → verdict FAIL → specwork node fail <change> <node> --reason "<failed checks>"
```

The implementer never grades its own homework. Verification is mandatory — `node complete` will reject unverified nodes.

## On Verification Failure

When verification fails and the node is retried (`subagent:respawn`):
- Include the `checks` array from the failed verification in the teammate's re-spawn context
- Highlight any `regressions` (checks that previously passed but now fail)
- The teammate needs to know exactly what broke to fix it

The CLI guides every step. See the `specwork-engine` skill for details on `next_action` fields.
