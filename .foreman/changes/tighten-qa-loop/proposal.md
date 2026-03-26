## Why

The engine skill describes a verify → QA → retry flow, but there's no CLI command to drive it. Currently the engine skill says "spawn verifier, spawn QA, handle results" — but this is entirely manual orchestration. The retry loop (verifier fails → fix → re-verify) isn't automated.

We need a `foreman node verify` command that:
1. Runs the verifier agent checks
2. Runs QA agent checks (based on verify mode)
3. Returns a structured verdict (PASS/FAIL with issues)
4. On FAIL, the engine skill automatically retries the implementation node with the failure context injected

This closes the loop: implement → verify → fail? → re-implement with feedback → verify again → pass → complete.

## What Changes

1. **New `foreman node verify` CLI command** — runs verification checks deterministically (tsc, tests, scope) and outputs structured JSON verdict
2. **Updated engine skill** — after each impl node, call `foreman node verify` before `foreman node complete`. On FAIL, auto-retry with failure context.
3. **Structured verify output** — JSON with check results, so the engine can programmatically decide retry vs escalate

## Capabilities

### New Capabilities
- `verify-command`: CLI command that runs node verification checks and returns structured verdict

### Modified Capabilities
- `engine-skill`: Updated verification section to use `foreman node verify` and auto-retry loop

## Impact

- `src/cli/node.ts` — add `verify` subcommand
- `.claude/skills/foreman-engine/SKILL.md` — update Section 3 (Verification) with auto-retry loop
- `.claude/agents/foreman-verifier.md` — minor: clarify output format for machine parsing
- `.claude/agents/foreman-qa.md` — minor: clarify verdict format for machine parsing
