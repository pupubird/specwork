# Summary: improve-go-cli-command-with-next-action-suggestions-for-each-nodegraph-state

**Archived:** 2026-03-26 | **Nodes:** 24 | **Status:** complete

## Summary

Move workflow knowledge from SKILL.md into CLI responses via a structured `next_action` field on every JSON response from `specwork go` and `specwork node *`. Each response tells the agent exactly what command to run next, with `context` sourced from `.specwork.yaml` to prevent intent drift across long workflows. SKILL.md trimmed from 466 lines to ~50 lines.

## Node Timeline

- **snapshot**: Environment snapshot captured
- **write-tests**: 22 tests written (13 unit, 9 integration) for next-action — all RED
- **impl-1-1**: NextAction interface added to state.ts
- **impl-1-2**: readChangeContext reads .specwork.yaml description
- **impl-1-3**: buildNextAction maps all 11 states to NextAction
- **impl-1-4**: NextAction auto-exported via types/index.ts barrel
- **impl-2-1**: next_action added to go.ts ready branch (team:spawn)
- **impl-2-2**: next_action added to go.ts done branch (suggest)
- **impl-2-3**: next_action added to go.ts blocked branch (escalate)
- **impl-2-4**: next_action added to go.ts waiting branch (wait)
- **impl-2-5**: next_action added to go.ts remaining branches
- **impl-3-1**: next_action added to node.ts start response
- **impl-3-2**: next_action added to node.ts complete response
- **impl-3-3**: next_action added to node.ts fail response with retries/exhausted branching
- **impl-3-4**: next_action added to node.ts escalate response
- **impl-3-5**: next_action added to node.ts verify PASS branch
- **impl-3-6**: next_action added to node.ts verify FAIL branch
- **impl-4-1**: SKILL.md trimmed from 466 to 60 lines
- **impl-4-2**: specwork-go.md trimmed to 13 lines
- **impl-5-1**: Unit tests for buildNextAction() — all 11 state/status combinations
- **impl-5-2**: Unit tests for readChangeContext() — valid file, missing file, missing field
- **impl-5-3**: Integration tests for specwork go JSON output next_action
- **impl-5-4**: Integration tests for specwork node complete/fail/escalate/verify next_action
- **integration**: 422 tests passing across 25 files

## Verification Summary

| Node | Verdict |
|------|---------|
| snapshot | PASS |
| write-tests | PASS |
| impl-1-1 | PASS |
| impl-1-2 | PASS |
| impl-1-3 | PASS |
| impl-1-4 | PASS |
| impl-2-1 | PASS |
| impl-2-2 | PASS |
| impl-2-3 | PASS |
| impl-2-4 | PASS |
| impl-2-5 | PASS |
| impl-3-1 | PASS |
| impl-3-2 | PASS |
| impl-3-3 | PASS |
| impl-3-4 | PASS |
| impl-3-5 | PASS |
| impl-3-6 | PASS |
| impl-4-1 | PASS |
| impl-4-2 | PASS |
| impl-5-1 | PASS |
| impl-5-2 | PASS |
| impl-5-3 | PASS |
| impl-5-4 | PASS |
| integration | PASS |
