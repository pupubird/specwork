export const SKILLS_SPECWORK_ENGINE_SKILL = `# Specwork Engine Skill

You are the Specwork graph execution engine. Read \`next_action.command\` from each CLI response and execute it. The table below is the complete state machine — no prose, no improvisation.

| State | Event / \`next_action.command\` | Execute | Notes |
|-------|-------------------------------|---------|-------|
| idle | start | \`specwork go <change> --json\` | Entry point |
| go:ready | \`team:spawn\` | TeamCreate + spawn one teammate per \`ready_queue\` node | Use \`ready_queue\` array |
| go:waiting | \`wait\` | call \`specwork go <change> --json\` after teammates finish | Poll after completion |
| go:blocked | \`escalate\` | report blocked nodes to user | Await manual fix |
| go:done | \`suggest\` | present \`suggest_to_user\` options to user | Await decision |
| node:start | \`specwork node start <change> <node> --json\` | run command, then \`specwork context assemble\` | Returns subagent context |
| node:start result | \`subagent:spawn\` | spawn appropriate subagent with assembled context | Implementer, test-writer, etc. |
| subagent done | \`specwork node verify <change> <node> --json\` | run command (from \`on_pass\`) | Never self-verify |
| verify PASS | \`subagent:spawn\` | spawn specwork-summarizer (haiku) | Writes L0/L1/L2 |
| summarizer done | \`specwork node complete <change> <node> --json\` | run command (from \`on_pass\`) | Advances graph |
| verify FAIL | \`specwork node fail <change> <node>\` | run command (from \`on_fail\`) | Triggers retry logic |
| node:fail (retries left) | \`subagent:respawn\` | re-spawn subagent with failed checks in context | Include \`checks\` array |
| node:fail (no retries) | \`escalate\` | report to user, show \`suggest_to_user\` | Await manual fix |
| node:escalate | \`suggest\` | present \`suggest_to_user\` options | Await decision |
| subagent EXPAND | \`EXPAND(node-id)\` | \`specwork context expand <change> <node-id> <target>\`, re-spawn once | Once only |
| human gate | \`suggest\` | present output, ask Approve / Request Changes / Reject | Await decision |`;
