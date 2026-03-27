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

### Modified Capabilities

- **`node-lifecycle`**: `node complete --l0` flag becomes optional; `node start --json` response gains a `context` field.

## Impact

- `src/cli/node.ts` — start (context injection), complete (optional --l0)
- `src/core/context-assembler.ts` — called from node start (no changes to assembler logic)
- `src/core/archive.ts` — replace buildSummary() with buildDigest()
- `src/core/next-action.ts` — update node:start and node:verify:pass next actions
- `.claude/skills/specwork-engine/SKILL.md` — add summarizer step to workflow
- `.claude/agents/specwork-summarizer.md` — clarify inputs/outputs/format
- `.claude/hooks/node-complete.sh` — simplify (summarizer now owns L0 writing)
- `.claude/skills/specwork-context/SKILL.md` — update docs for auto-injection
