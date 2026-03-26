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

## Node Execution Flow

Every node follows this lifecycle. The lead (you) drives each step:

```
specwork node start → spawn teammate → teammate works → you verify → complete/fail
```

### Step-by-step:

1. **Start**: `specwork node start <change> <node> --json` — sets scope, returns `next_action`
2. **Context**: `specwork context assemble <change> <node>` — gathers L0/L1/snapshot for subagent
3. **Spawn**: Create a teammate (implementer, test-writer, etc.) with the assembled context
4. **Wait**: Teammate does its work within declared scope
5. **Verify**: When teammate finishes, **you** run `specwork node verify <change> <node> --json`
   - The implementer never grades its own homework
   - The CLI runs all checks: scope-check, files-unchanged, imports-exist, tsc-check, tests-pass
   - Checks run in priority order with fail-fast (cheap checks first)
6. **Route on verdict**:
   - `verdict: PASS` → follow `next_action.on_pass` → `specwork node complete`
   - `verdict: FAIL` → follow `next_action.on_fail` → `specwork node fail`
   - If regressions detected, the response includes `regressions` array — highlight these

### Verification is mandatory

- Nodes cannot be completed without passing verification (`verified: true` in state)
- `specwork node complete` will reject unverified nodes with an error
- Always verify before completing — no shortcuts

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

## Verification Details

When you run `specwork node verify <change> <node> --json`, the response includes:

```json
{
  "verdict": "PASS",
  "checks": [
    { "type": "scope-check", "status": "PASS", "detail": "All files in scope", "duration_ms": 12 },
    { "type": "tsc-check", "status": "PASS", "detail": "No type errors", "duration_ms": 1200 }
  ],
  "failed_count": 0,
  "total_checks": 5,
  "regressions": [],
  "full_output_path": ".specwork/nodes/<change>/<node>/verify-output.txt",
  "next_action": { ... }
}
```

**On FAIL**, the `checks` array tells you exactly what broke:
- `errors` array has structured info: `{ file, line, message, code }`
- `SKIPPED` checks were skipped due to a prerequisite failure (fail-fast)
- `regressions` lists checks that previously passed but now fail — flag these to the user

**On retry**, include the failed checks in the teammate's re-spawn context so it knows what to fix.

---

## Rules

1. **Never read YAML files directly** — the CLI is the control plane
2. **Always use TeamCreate** for execution batches, even single-node batches
3. **Follow `next_action` exactly** — don't improvise workflow steps
4. **Fill in `<placeholders>`** in `on_pass`/`on_fail` with actual values (e.g., `<summary>`, `<error>`)
5. **`context` is your anchor** — if you're unsure what to do, re-read `context`
6. **Always verify before completing** — run `specwork node verify` after every teammate finishes
7. **Report regressions** — if `regressions` array is non-empty, tell the user which checks regressed

---

## Special Cases

- **`team:spawn`** — create a team (`exec-<change>-<batch>`), spawn one teammate per ready node. After each teammate finishes, verify their work before completing.
- **`subagent:respawn`** — re-spawn the subagent with failure feedback injected into context. Include the `checks` array from the failed verification so it knows what to fix.
- **`suggest`** — present `suggest_to_user` options to the user and await their decision
- **`wait`** — teammates are running. Call `specwork go` again when they finish
- **`escalate`** — report blocked nodes to the user for manual intervention
- **EXPAND** — if a subagent's first line is `EXPAND(node-id)`, run `specwork context expand <change> <node-id> <target>` and re-spawn (once only)
- **Human gate nodes** — present output, ask user: Approve / Request Changes / Reject

---

## Custom Checks

Projects can define custom validation checks in `.specwork/config.yaml`:

```yaml
checks:
  lint:
    command: "npx eslint {scope}"
    expect: exit-0
    description: "ESLint passes"
    phase: [impl, integration]
```

These run alongside built-in checks during `specwork node verify`. The `{scope}` placeholder is replaced with the node's declared scope paths.
