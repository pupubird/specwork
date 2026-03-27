## 1. Context Injection on Node Start

- [ ] 1.1 Add `assembleContext` + `renderContext` imports to `src/cli/node.ts` and call them in `startCmd` after `ensureDir(nodeDir(...))`
- [ ] 1.2 Append `context: renderContext(bundle)` to `nodeInfo` object in JSON output only (not human-readable table)
- [ ] 1.3 Update `node:start` case in `src/core/next-action.ts` — remove `specwork context assemble` command hint; update description to say context is inline in the response

## 2. Optional --l0 on Node Complete

- [ ] 2.1 In `completeCmd`, change `opts.l0` handling: if flag absent, read `L0.md` from `nodeDir(root, change, nodeId)` and strip leading `nodeId: ` prefix
- [ ] 2.2 Keep existing L0.md write path unchanged when `--l0` IS provided

## 3. Summarizer Agent Invocation After Verify Pass

- [ ] 3.1 Update `node:verify:pass` case in `src/core/next-action.ts`: command becomes `subagent:spawn` for `specwork-summarizer`; `on_pass` becomes `specwork node complete <change> <node>` without `--l0`
- [ ] 3.2 Update `.claude/skills/specwork-engine/SKILL.md`: document verify PASS → spawn summarizer → node complete flow
- [ ] 3.3 Update `.claude/agents/specwork-summarizer.md`: clarify inputs (change, nodeId, root), L0 format (no leading dash, format is `nodeId: headline`), output files (L0.md, L1.md, L2.md), and git diff source
- [ ] 3.4 Simplify `.claude/hooks/node-complete.sh`: remove L0-writing logic (summarizer owns it now)

## 4. Archive Digest

- [ ] 4.1 Add `buildDigest(root, change): string` function to `src/core/archive.ts` reading L0.md + L1.md per node and verify.md for verdicts
- [ ] 4.2 Replace `buildSummary()` call in `archiveChange()` with `buildDigest()` and write to `digest.md` instead of `summary.md`

## 5. Context Skill Docs

- [ ] 5.1 Update `.claude/skills/specwork-context/SKILL.md`: note that `node start --json` includes `context` field; `specwork context assemble` remains available for manual/EXPAND use
