## Why

The Foreman engine's workflow instructions live in `.claude/skills/foreman-engine/SKILL.md` — currently 466 lines. Every agent that runs a workflow step must load this entire file to know what to do next. This creates several failure modes:

1. **Context drift** — agents deep in a workflow may lose track of where they are after many node transitions, even with SKILL.md in context.
2. **Cognitive load** — agents must mentally simulate the state machine to determine the right next step. The skill duplicates logic that already exists in the CLI.
3. **Brittleness** — when the state machine changes, both the CLI code AND SKILL.md must be updated in sync. They frequently drift.
4. **Redundancy** — `foreman go` already knows what's ready, blocked, or done. It outputs that information but leaves the agent to figure out what to do with it.

The result: agents sometimes skip steps, retry incorrectly, or fail to report back — because workflow knowledge lives in their brain, not in the system.

## What Changes

Move workflow knowledge from SKILL.md into CLI responses via a structured `next_action` field.

Every JSON response from `foreman go`, `foreman node start`, `foreman node complete`, `foreman node fail`, `foreman node escalate`, and `foreman node verify` will include a `next_action` object:

```json
{
  "status": "ready",
  "ready": ["impl-1", "impl-2"],
  "next_action": {
    "command": "team:spawn",
    "description": "Create a team and spawn one implementer teammate per ready node.",
    "context": "Adding JWT authentication to the API",
    "on_pass": "foreman node complete <node-id> --summary '<L0>'",
    "on_fail": "foreman node fail <node-id> --reason '<error>'"
  }
}
```

The `context` field is read from `.foreman.yaml`'s `description` at every state transition — ensuring the agent never forgets the original user intent even after dozens of node transitions.

SKILL.md shrinks from 466 lines to ~50 lines: "read next_action and follow it."

## Capabilities

### New Capabilities
- `go-next-action`: Every CLI response includes a structured `next_action` guiding the agent's exact next step

### Modified Capabilities
- `foreman-engine`: SKILL.md trimmed from 466 lines to ~50 lines — workflow logic moves into CLI responses

## Impact

- Agents can drive complete workflows end-to-end by following `next_action` alone
- SKILL.md context load drops by ~90%
- State machine changes only require CLI code updates (no SKILL.md sync needed)
- `context` field prevents intent drift across long-running workflows
