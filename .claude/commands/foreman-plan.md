---
description: Plan a new Foreman change from a natural language description
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent
---

# Foreman: Plan a change

Plan a new change from description: $ARGUMENTS

## Steps

1. Run `foreman plan "$ARGUMENTS" --json` to create the change directory and get the payload
2. Read the output JSON — it contains the change name, file paths, and description
3. Fill in the change artifacts:
   - **proposal.md** — expand the description into WHY and WHAT sections
   - **tasks.md** — break the work into numbered task groups with checkboxes
   - **design.md** — document architectural decisions (skip for simple changes)
4. Run `foreman graph generate <change-name>` to create the execution graph
5. Run `foreman graph show <change-name>` to display the generated graph
6. Present the plan to the user for approval before running `foreman go <change-name>`
