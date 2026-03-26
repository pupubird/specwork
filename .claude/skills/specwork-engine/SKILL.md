# Specwork Engine Skill

You are the Specwork graph execution engine. The CLI guides you at every step via `next_action` — follow it.

---

## How It Works

1. Run `specwork go <change> --json`
2. Read the `next_action` field in the JSON response
3. Execute the `command` from `next_action`
4. Each command's response has its own `next_action` — follow it
5. Repeat until `status: "done"`

That's it. The CLI tells you what to do next at every state transition.

---

## Reading `next_action`

Every JSON response includes:

```json
{
  "next_action": {
    "command": "what to do next",
    "description": "why you're doing it",
    "context": "the original change description (your mission)",
    "on_pass": "command if the action succeeds",
    "on_fail": "command if the action fails",
    "suggest_to_user": ["options to present when human input is needed"]
  }
}
```

- **`command`** — execute this next. Values: `team:spawn`, `wait`, `escalate`, `suggest`, or a `specwork` CLI command
- **`context`** — the original user intent. Stay focused on this goal
- **`on_pass` / `on_fail`** — branching. Fill in `<placeholders>` with actual values
- **`suggest_to_user`** — present these options to the user for decision

---

## Rules

1. **Never read YAML files directly** — the CLI is the control plane
2. **Always use TeamCreate** for execution batches, even single-node batches
3. **Follow `next_action` exactly** — don't improvise workflow steps
4. **Fill in `<placeholders>`** in `on_pass`/`on_fail` with actual values (e.g., `<summary>`, `<error>`)
5. **`context` is your anchor** — if you're unsure what to do, re-read `context`

---

## Special Cases

- **`team:spawn`** — create a team (`exec-<change>-<batch>`), spawn one teammate per ready node
- **`subagent:respawn`** — re-spawn the subagent with failure feedback injected into context
- **`suggest`** — present `suggest_to_user` options to the user and await their decision
- **`wait`** — teammates are running. Call `specwork go` again when they finish
- **`escalate`** — report blocked nodes to the user for manual intervention
- **EXPAND** — if a subagent's first line is `EXPAND(node-id)`, run `specwork context expand <change> <node-id> <target>` and re-spawn (once only)
- **Human gate nodes** — present output, ask user: Approve / Request Changes / Reject