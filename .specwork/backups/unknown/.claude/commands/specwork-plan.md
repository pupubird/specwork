---
description: Plan a new Specwork change from a natural language description
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent, TeamCreate, TeamDelete, TaskCreate, TaskUpdate, SendMessage
---

# Specwork: Plan a change

Plan a new change from description: $ARGUMENTS

## Steps

### 1. Create the change
```bash
specwork plan "$ARGUMENTS" --json
```
Read the output JSON — it contains `change`, `mode`, `path`, and `description`.

### 2. Assemble planning context

Before spawning any planner agent, pre-assemble a compact `<planning-context>` block:

1. **Spec headers** — Grep `.specwork/specs/` for `### Requirement:` lines. Include only the header lines, not full spec content. If no specs exist, note "No existing specs found."
2. **Environment snapshot** — Read `.specwork/env/snapshot.md` if it exists, or run `specwork snapshot` to generate it.
3. **Relevant source paths** — Based on the description, identify key source files that will likely be affected.

Bundle into a `<planning-context>` block:
```
<planning-context>
## Existing Specs
- spec-enforcement.md: ### Requirement: Mandatory Spec Generation
- spec-enforcement.md: ### Requirement: Spec-Fed Test Writing
(... one line per requirement header)

## Environment Snapshot
(snapshot.md content — file tree, deps, exports)

## Relevant Source Paths
- src/core/graph-generator.ts
- src/cli/go.ts
(... paths likely affected by this change)
</planning-context>
```

Keep the context block compact — under ~500 tokens. Headers only, not full spec content.

### 3. Branch based on mode

**If `mode: "brainstorm"` (default):**

1. Create a team: `TeamCreate` with name `plan-<change>`
2. Create research task: `TaskCreate` for research phase
3. Spawn `specwork-planner` teammate with `phase: "research"`:
   - Pass the description, change path, AND the `<planning-context>` block
   - Agent uses the pre-assembled context, fills gaps, returns findings + 3-5 clarifying questions
4. For EACH question from the planner agent, use `AskUserQuestion` to ask the user:
   - Include the agent's finding/context as part of the question text
   - Provide the agent's suggested options as the `options` array
   - Wait for the user's answer before asking the next question
   - Collect all answers
5. Once all questions are answered, compile the answers
6. Create generate task: `TaskCreate` for generate phase
7. Spawn `specwork-planner` teammate with `phase: "generate"`:
   - Pass the description, answers, change path, AND the `<planning-context>` block
   - Agent writes proposal.md, design.md, tasks.md, and specs/
   - Returns a summary of what was generated
8. Cleanup: `SendMessage` shutdown to teammates → `TeamDelete`

**If `mode: "yolo"` (--yolo flag):**

1. Create a team: `TeamCreate` with name `plan-<change>`
2. Create YOLO task: `TaskCreate` for YOLO phase
3. Spawn `specwork-planner` teammate with `phase: "yolo"`:
   - Pass the description, change path, AND the `<planning-context>` block
   - Agent uses pre-assembled context, makes all decisions, writes all artifacts
   - Returns a summary
4. Cleanup: `SendMessage` shutdown → `TeamDelete`

### 4. Generate graph, visualize, and present plan
```bash
specwork graph generate <change-name>
specwork graph show <change-name>
specwork viz <change-name> --json
```

The `specwork viz` command generates a **base** HTML overview (`overview.html`) and returns agent instructions in JSON. After running the command:

1. Read the `agent_instructions` field from the JSON output
2. Follow the instructions: read the generated `overview.html`, then **enhance it** using the Edit tool — rewrite descriptions, add annotations, improve layout, add visual emphasis tailored to this specific change
3. When done editing, open the final HTML in the browser: `open <path>` (macOS) or `xdg-open <path>` (Linux)
4. Show the graph table to the user and ask for approval before proceeding to `specwork go`
