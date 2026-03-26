export const COMMANDS_SPECWORK_GO = `---
description: Run a Specwork workflow autonomously from start to finish
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent, TeamCreate, TeamDelete, TaskCreate, TaskUpdate, SendMessage
---

# Specwork: Go

Run the workflow for change: $ARGUMENTS

1. Run \`specwork go $ARGUMENTS --json\`
2. Follow \`next_action\` in the response
3. After each CLI call, follow the new \`next_action\`
4. Repeat until \`status: "done"\`

The CLI guides every step. See the \`specwork-engine\` skill for details on \`next_action\` fields.
`;
