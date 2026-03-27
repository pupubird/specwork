# Proposal: Progressive Context System (L0/L1/L2)

## Problem

The Specwork engine documents a three-tier context system (L0/L1/L2) in CLAUDE.md but the implementation is incomplete in three ways:

1. **Node start is context-blind.** `specwork node start` returns node metadata and a `next_action` telling the engine to run `specwork context assemble` as a separate step. Subagents receive no context at node start — they must make an extra CLI call before they can begin work, breaking the "one command, full context" promise.

2. **Summarization is manual and inconsistent.** The `--l0` flag on `specwork node complete` requires the implementing agent to self-summarize. Agents write poor L0s and skip L1/L2 entirely. Without L1/L2, future nodes cannot see what their parents produced — the progressive context chain is broken.

3. **Archive loses structured context.** `archiveChange()` writes `summary.md` containing raw `verify.md` output — low signal, high noise. Future agents reading the archive to understand related business logic must wade through test runner output instead of structured decision summaries.

## What Changes

### New Capabilities

- **`context-injection`**: `specwork node start --json` auto-injects assembled context (snapshot + L0 for completed nodes + L1 for parent nodes + node inputs + node prompt) as a `context` field in its JSON response. No separate CLI call needed.

- **`auto-summarization`**: After `specwork node verify` returns PASS, the engine workflow spawns the `specwork-summarizer` agent (haiku model). The summarizer reads the git diff and verify output, then writes `L0.md`, `L1.md`, and `L2.md` to the node's artifact directory. The `--l0` flag on `node complete` becomes optional — it reads from `L0.md` on disk if the flag is absent.

- **`archive-digest`**: `archiveChange()` builds a `digest.md` instead of `summary.md`. The digest consolidates change metadata, all L0 headlines, L1 details per node (files changed, exports, decisions), and a verification summary table. L2 files are omitted (full diffs are in git history). The digest is optimized for future agent reads.

- **`task-auto-update`**: When an impl node completes, the corresponding checkbox in `tasks.md` is automatically checked off (`- [ ]` → `- [x]`). When a node fails or is escalated, the checkbox is reverted (`- [x]` → `- [ ]`). Non-impl nodes (`write-tests`, `integration`) can also check off convention lines prefixed with their node ID.

### Modified Capabilities

- **`node-lifecycle`**: `node complete --l0` flag becomes optional; `node start --json` response gains a `context` field. `node complete` and `node fail` auto-update `tasks.md`.

- **`tasks-auto-update`**: `specwork node complete` already checks off `- [ ]` → `- [x]` for `impl-N-M` nodes in `tasks.md`. This change extends that in three ways: (1) adds `uncheckTask()` so `node fail` and `node escalate` revert `- [x]` → `- [ ]`, keeping tasks.md in sync with actual workflow state; (2) adds a convention for `write-tests:` and `integration:` prefix lines so non-impl nodes are also trackable in tasks.md; (3) adds spec coverage and tests for all checkbox behavior.

## Impact

- `src/cli/node.ts` — start (context injection), complete (optional --l0), fail + escalate (uncheckTask)
- `src/core/context-assembler.ts` — called from node start (no changes to assembler logic)
- `src/core/archive.ts` — replace buildSummary() with buildDigest()
- `src/core/next-action.ts` — update node:start and node:verify:pass next actions
- `src/core/graph-generator.ts` — skip write-tests/integration convention lines from impl task parsing
- `.claude/skills/specwork-engine/SKILL.md` — add summarizer step to workflow
- `.claude/agents/specwork-summarizer.md` — clarify inputs/outputs/format
- `.claude/hooks/node-complete.sh` — simplify (summarizer now owns L0 writing)
- `.claude/skills/specwork-context/SKILL.md` — update docs for auto-injection
- `src/cli/node.ts` — fail/escalate (uncheckTask), complete (convention lines for write-tests/integration)
- `src/core/graph-generator.ts` — skip write-tests/integration convention lines from impl task parsing
