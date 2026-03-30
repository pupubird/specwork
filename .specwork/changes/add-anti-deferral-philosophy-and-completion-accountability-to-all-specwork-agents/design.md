## Context

Specwork agents defer work — they write TODOs, stub tests, and mark nodes complete before work is actually done. The current verification system runs structural checks only (file exists, exports present) and has no semantic completeness audit. `specwork-qa` already exists with adversarial deferral detection but is not wired into any workflow step. This change adds five layers of enforcement to close those gaps.

## Goals / Non-Goals

**Goals:**
- Prohibit deferred work in all agent instruction files
- Mechanically detect TODO/FIXME/stub patterns in diffs and fail verification
- Wire specwork-qa into per-node lifecycle after verify PASS
- Add `go:final-review` engine state for holistic change QA before `go:done`
- Extend `ChangeStatus` type to support the new state

**Non-Goals:**
- Self-reporting by agents (agents cannot be trusted to accurately report their own completeness)
- Retroactive remediation of existing completed changes
- Linting pre-existing TODO debt outside the current diff

## Decisions

### Decision: Pattern matching + QA agent (not just one)
Pattern matching (`no-todos` check) is fast and deterministic — it catches the obvious cases. The QA agent catches semantic holes that patterns miss (e.g. a function body that returns a hardcoded value). Both are needed. Pattern matching blocks immediately; QA agent provides depth.

### Decision: Per-node QA is lightweight (diff-scoped), final review is holistic (change-scoped)
Running full holistic QA after every node is expensive and redundant — each node's QA only needs to care about what that node changed. The final review is the one place where cross-node concerns (regressions, integration gaps) get checked. This keeps per-node QA fast while still providing end-to-end completeness guarantees.

### Decision: Final review FAIL → go:blocked (not auto-retry)
Final review failure indicates a systemic problem across the change, not a single node issue. Auto-retry would waste compute without giving the human a chance to triage. Blocking and surfacing the report to the user is the right escalation path.

### Decision: no-todos check skips .specwork/ directory
Specs and proposals legitimately discuss TODOs as concepts ("the agent must not write TODO comments"). Scanning those files would produce false positives. The check targets implementation diffs only.

## Risks / Trade-offs

- [Per-node QA increases total execution time] → Lightweight scope (diff-only) keeps it fast; QA cost is near-zero when nodes are clean
- [no-todos check could flag legitimate uses] → Pattern is word-boundary matched and excludes .specwork/ files; edge cases configurable via check options in graph.yaml
- [go:final-review adds a new blocking state] → This is intentional — a change that fails final review should not auto-archive

## Migration Plan

1. Deploy type change first (Layer 5) — safe, additive
2. Deploy engine state changes (Layer 4) — state machine extended, new status handled
3. Deploy verification check (Layer 2) — new check available, not yet default
4. Wire per-node QA (Layer 3) — update go.md and SKILL.md
5. Update agent instructions (Layer 1) — last, as these affect agent behavior going forward

All layers are additive. No existing graph.yaml files need migration. The `no-todos` check becomes a default check automatically once deployed.

## Open Questions

None — all decisions resolved by user in planning phase.
