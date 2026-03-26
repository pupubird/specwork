export const COMMANDS_FOREMAN_PLAN = `---
description: Plan a new Foreman change from a natural language description
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent, TeamCreate, TeamDelete, TaskCreate, TaskUpdate, SendMessage
---

# Foreman: Plan a change

Plan a new change from description: $ARGUMENTS

## Steps

### 1. Create the change
\`\`\`bash
foreman plan "$ARGUMENTS" --json
\`\`\`
Read the output JSON — it contains \`change\`, \`mode\`, \`path\`, and \`description\`.

### 2. Assemble planning context

Before spawning any planner agent, pre-assemble a compact \`<planning-context>\` block:

1. **Spec headers** — Grep \`.foreman/specs/\` for \`### Requirement:\` lines. Include only the header lines, not full spec content. If no specs exist, note "No existing specs found."
2. **Environment snapshot** — Read \`.foreman/env/snapshot.md\` if it exists, or run \`foreman snapshot\` to generate it.
3. **Relevant source paths** — Based on the description, identify key source files that will likely be affected.

Bundle into a \`<planning-context>\` block:
\`\`\`
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
\`\`\`

Keep the context block compact — under ~500 tokens. Headers only, not full spec content.

### 3. Branch based on mode

**If \`mode: "brainstorm"\` (default):**

1. Create a team: \`TeamCreate\` with name \`plan-<change>\`
2. Create research task: \`TaskCreate\` for research phase
3. Spawn \`foreman-planner\` teammate with \`phase: "research"\`:
   - Pass the description, change path, AND the \`<planning-context>\` block
   - Agent uses the pre-assembled context, fills gaps, returns findings + 3-5 clarifying questions
4. Present the questions to the user with the agent's findings
5. Collect user answers
6. Create generate task: \`TaskCreate\` for generate phase
7. Spawn \`foreman-planner\` teammate with \`phase: "generate"\`:
   - Pass the description, answers, change path, AND the \`<planning-context>\` block
   - Agent writes proposal.md, design.md, tasks.md, and specs/
   - Returns a summary of what was generated
8. Cleanup: \`SendMessage\` shutdown to teammates → \`TeamDelete\`

**If \`mode: "yolo"\` (--yolo flag):**

1. Create a team: \`TeamCreate\` with name \`plan-<change>\`
2. Create YOLO task: \`TaskCreate\` for YOLO phase
3. Spawn \`foreman-planner\` teammate with \`phase: "yolo"\`:
   - Pass the description, change path, AND the \`<planning-context>\` block
   - Agent uses pre-assembled context, makes all decisions, writes all artifacts
   - Returns a summary
4. Cleanup: \`SendMessage\` shutdown → \`TeamDelete\`

### 4. Generate graph and present plan
\`\`\`bash
foreman graph generate <change-name>
foreman graph show <change-name>
\`\`\`
Show the generated graph to the user. Ask for approval before proceeding to \`foreman go\`.
`;
