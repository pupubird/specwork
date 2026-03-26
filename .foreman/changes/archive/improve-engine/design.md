## Context

Foreman's workflow engine has three gaps:
1. No archive step — completed changes clutter `.foreman/changes/`
2. QA agent described in engine skill but never orchestrated
3. Agent team usage undocumented

## Goals / Non-Goals

**Goals:**
- Auto-archive changes when `foreman go` returns `status: "done"` with `changeStatus === "complete"`
- Archive preserves all artifacts: change dir, graph.yaml, state.yaml, node artifacts (L0/L1/L2, verify.md, qa-report.md)
- QA orchestration follows `config.execution.verify` mode (strict/gates/none)
- Document agent team patterns in engine skill

**Non-Goals:**
- Manual `foreman archive` command (auto-only for now)
- QA agent modifications (already well-defined in `.claude/agents/foreman-qa.md`)
- Changing the verify command itself (works fine)

## Decisions

### Decision: Archive in `foreman go` not `foreman node complete`
Archive triggers when ALL nodes are terminal, not when individual nodes complete. This is simpler and avoids partial archives. The `foreman go` command already detects the "done" state — just add archive call there.

### Decision: Copy then delete (not move)
Copy change + graph + nodes to archive first, then remove originals. Safer than `mv` — if copy fails, originals remain.

### Decision: QA logic lives in engine skill, not CLI
The QA agent is spawned by the engine (an LLM), not by a CLI command. The engine skill describes WHEN to spawn it. The CLI provides `foreman node verify` for deterministic checks only.

## Risks / Trade-offs

- [Risk: Archive during active workflow] -> Only archive when `changeStatus === 'complete'`, never on `failed`/`paused`
- [Risk: Large node artifacts slow archive] -> Just filesystem copy, no serialization overhead
- [Risk: QA agent false positives block progress] -> QA failures respect `max_retries` budget, escalate after exhaustion

## Open Questions

None — design is straightforward.
