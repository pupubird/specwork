## Context

The CLI already knows the full workflow state — which nodes are ready, blocked, in progress, complete, or failed. It outputs this as JSON. The problem is agents must separately know (via SKILL.md) what to do given each status. This design moves that decision-making into the CLI output itself.

## Goals / Non-Goals

**Goals:**
- Add `next_action` to all CLI JSON responses (specwork go, specwork node *)
- Include `context` field in every `next_action` sourced from `.specwork.yaml` description
- Include conditional `on_pass` / `on_fail` branches where nodes have outcomes
- Include `suggest_to_user` array in `done` state responses
- Trim SKILL.md to under 60 lines

**Non-Goals:**
- Changes to the state machine itself (states, transitions, retry logic remain unchanged)
- Changes to `.specwork.yaml` schema (description field already exists)
- Interactive/streaming output — JSON output format is unchanged except for added field

## Decisions

### Decision: NextAction as a flat struct, not a union type
A flat struct with optional fields (`on_pass`, `on_fail`, `suggest_to_user`) is simpler to produce and consume than a discriminated union. Absent fields are omitted from output (undefined, not null). Agents can check presence.

### Decision: context read at emission time, not cached
`.specwork.yaml` is small and fast to read. Reading it fresh at every state transition ensures context is always accurate, even if the description was edited mid-workflow. No caching layer needed.

### Decision: buildNextAction() as a pure helper function
All mapping logic (state → next_action) lives in one `buildNextAction(status, nodes, context)` function. CLI files call it; they don't contain the logic. This makes the mapping table easy to audit and update without touching CLI command files.

### Decision: on_pass/on_fail as template strings with placeholders
Values like `"specwork node complete <node-id> --summary '<L0>'"` use angle-bracket placeholders the agent fills in. This makes the commands self-documenting and directly executable after substitution.

## Type Definition

```typescript
// src/types/state.ts additions

export interface NextAction {
  command: string;          // What to run: e.g. "team:spawn", "specwork node complete <id>"
  description: string;      // Human-readable explanation of the action
  context: string;          // Change description from .specwork.yaml (intent reinforcement)
  on_pass?: string;         // Command to run on success (for nodes with outcomes)
  on_fail?: string;         // Command to run on failure (for nodes with outcomes)
  suggest_to_user?: string[]; // Suggestions for done state (archive, review, etc.)
}
```

## buildNextAction() Helper

Location: `src/core/next-action.ts`

```typescript
export function buildNextAction(
  status: 'ready' | 'done' | 'blocked' | 'waiting' | 'in_progress' | 'complete' | 'failed' | 'escalated',
  context: string,
  opts?: {
    nodeId?: string;
    readyNodes?: string[];
    blockedNodes?: Array<{ id: string; reason: string }>;
    retriesLeft?: number;
  }
): NextAction
```

### State → next_action mapping

| CLI Command | Response Status | command | description |
|---|---|---|---|
| `specwork go` → ready | nodes available | `team:spawn` | Create team, spawn teammate per ready node |
| `specwork go` → done | all terminal | `suggest` | Workflow complete — archive, review, or request changes |
| `specwork go` → blocked | no runnable nodes | `escalate` | Report blocked nodes, suggest escalate or manual fix |
| `specwork go` → waiting | nodes in progress | `wait` | Teammates running — call `specwork go` again when done |
| `specwork node start` | in_progress | `specwork node complete <id>` | Assemble context, spawn subagent, then complete |
| `specwork node verify` → PASS | verified | `specwork node complete <id>` | Complete node with L0 summary |
| `specwork node verify` → FAIL | failed checks | `specwork node fail <id>` | Fail node with reason; retry logic applies |
| `specwork node complete` | complete | `specwork go` | Re-run go for next batch |
| `specwork node fail` (retries left) | failed | `subagent:respawn` | Re-spawn subagent with failure feedback |
| `specwork node fail` (exhausted) | escalated | `specwork node escalate <id>` | Report to user, suggest manual fix or skip |
| `specwork node escalate` | escalated | `suggest` | Report to user with skipped dependents list |

## readChangeContext() Helper

Location: `src/core/next-action.ts`

Reads `.specwork/changes/<change-name>/.specwork.yaml` and returns the `description` field. Returns empty string if file is missing or unreadable — `next_action.context` will be an empty string in that case (not an error).

## How SKILL.md Gets Trimmed

Current SKILL.md (~466 lines) contains:
- Full state machine documentation
- Node lifecycle instructions
- Context assembly steps
- Error handling recipes
- Team creation patterns

After this change, SKILL.md becomes (~50 lines):
1. "Read `next_action` from every CLI response"
2. "Execute `command` from `next_action`"
3. "Use `on_pass` / `on_fail` for branching"
4. "Check `suggest_to_user` when status is done"
5. "The `context` field reminds you of the original goal"

All procedural detail is replaced by "the CLI tells you what to do next."

## Risks / Trade-offs

- [CLI output schema change] → Additive only — new field, no removals. Existing parsers that don't read `next_action` are unaffected.
- [SKILL.md trimmed too aggressively] → Mitigation: keep edge-case notes for EXPAND, scope-guard errors, and human gate patterns since these are not expressible in a simple next_action.
- [Context field from stale .specwork.yaml] → Reading at emission time ensures freshness; no cache invalidation needed.
