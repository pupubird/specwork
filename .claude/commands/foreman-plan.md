---
description: Plan a new Foreman change from a natural language description
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent
---

# Foreman: Plan a change

Plan a new change from description: $ARGUMENTS

## Steps

### 1. Create the change
```bash
foreman plan "$ARGUMENTS" --json
```
Read the output JSON — it contains `change`, `mode`, `path`, and `description`.

### 2. Branch based on mode

**If `mode: "brainstorm"` (default):**

1. Spawn `foreman-planner` agent with `phase: "research"`:
   - Pass the description and change path
   - Agent reads codebase, finds context, returns findings + 3-5 clarifying questions
2. Present the questions to the user with the agent's findings
3. Collect user answers
4. Spawn `foreman-planner` agent with `phase: "generate"`:
   - Pass the description, answers, and change path
   - Agent writes proposal.md, design.md, tasks.md, and specs/
   - Returns a summary of what was generated

**If `mode: "yolo"` (--yolo flag):**

1. Spawn `foreman-planner` agent with `phase: "yolo"`:
   - Pass the description and change path
   - Agent researches codebase silently, makes all decisions, writes all artifacts
   - Returns a summary

### 3. Generate graph and present plan
```bash
foreman graph generate <change-name>
foreman graph show <change-name>
```
Show the generated graph to the user. Ask for approval before proceeding to `foreman go`.
