# Design: Progressive Context System (L0/L1/L2)

## Context

The context assembler (`src/core/context-assembler.ts`) and the L0/L1/L2 tier model already exist. The missing pieces are: (1) wiring the assembler into `node start`, (2) automating summarization after verify passes, and (3) replacing the archive's raw summary with a structured digest.

## Goals / Non-Goals

**Goals:**
- Auto-inject context in `node start --json` response
- Auto-generate L0/L1/L2 via summarizer agent after verify PASS
- Build a structured `digest.md` on archive with L0 timeline + L1 details
- Keep `specwork context assemble` working independently (EXPAND flows, manual use)

**Non-Goals:**
- Changes to EXPAND mechanism
- Changes to the assembler logic itself
- Changes to context tier sizes or formats

## Decisions

### Decision: Context injection in JSON response only
The rendered context string can be hundreds of lines. Injecting it into the human-readable table output would be useless noise. JSON mode is consumed programmatically by the engine — that is the right place for it.

### Decision: Summarizer spawned by engine skill, not by CLI
The `specwork node verify` CLI writes the verdict to state and returns a `next_action`. The engine skill reads that next action and decides what to do next. Spawning the summarizer belongs in the engine workflow, not in the verify CLI, to preserve the separation between deterministic CLI operations and LLM agent spawning.

### Decision: `--l0` flag remains, but optional
Backward compatibility: existing workflows that pass `--l0` explicitly still work. The flag becoming optional allows the normal summarizer-driven flow without requiring a breaking change.

### Decision: L2 excluded from digest
L2 contains full diffs. Git history is the authoritative source for full diffs. Duplicating them in the archive wastes space and makes the digest harder to read for its intended audience (future agents seeking business logic context).

## Component Changes

### `src/cli/node.ts` — startCmd

Import `assembleContext` and `renderContext` from `../core/context-assembler.js`. After `ensureDir(nodeDir(...))`, call:

```ts
const bundle = assembleContext(root, change, nodeId);
const context = renderContext(bundle);
```

Add `context` to `nodeInfo`. Only include in JSON output.

### `src/cli/node.ts` — completeCmd

Change `opts.l0` handling to fall back to reading `L0.md`:

```ts
let l0Summary = opts.l0 ?? null;
if (!l0Summary) {
  const l0FilePath = path.join(nodeDir(root, change, nodeId), 'L0.md');
  if (fs.existsSync(l0FilePath)) {
    const raw = fs.readFileSync(l0FilePath, 'utf8').trim();
    // Strip leading "nodeId: " prefix written by summarizer
    l0Summary = raw.replace(/^[^:]+:\s*/, '');
  }
}
```

Keep the existing L0.md write path for when `--l0` IS provided.

### `src/core/next-action.ts`

**`node:start`**: Remove the explicit `specwork context assemble` command. Context is now in the response. Update description:

```ts
case 'node:start':
  return {
    command: 'subagent:spawn',
    description: `Context is assembled and included in this response. Spawn the appropriate subagent for node ${nodeId} using the context field. After the subagent finishes, run verification — the implementer never grades its own homework.`,
    context,
    on_pass: `specwork node verify ${change} ${nodeId} --json`,
    on_fail: `specwork node fail ${change} ${nodeId} --reason '<error>'`,
  };
```

**`node:verify:pass`**: Update to reflect the summarizer step:

```ts
case 'node:verify:pass':
  return {
    command: 'subagent:spawn',
    description: `Verification passed for ${nodeId}. Spawn specwork-summarizer (haiku) to write L0/L1/L2, then complete the node.`,
    context,
    on_pass: `specwork node complete ${change} ${nodeId}`,
  };
```

### `src/core/archive.ts` — buildDigest()

New function replacing `buildSummary()`:

```
# Digest: <change>

**Archived:** <date> | **Nodes:** <count> | **Status:** <status>

## Summary
<description from .specwork.yaml>

## Node Timeline (L0)
- **<nodeId>**: <L0 headline>
...

## Node Details (L1)

### <nodeId>
<L1.md content>
**Verification:** PASS | <check count> checks
---

## Verification Summary
| Node | Verdict | Checks |
|------|---------|--------|
| ...  | PASS    | 5      |
```

L0 and L1 are read from `.specwork/nodes/<change>/<nodeId>/L0.md` and `L1.md`. Nodes missing L1.md appear in the timeline but not in the details section. Verify verdict and check count are extracted from `verify.md` (last line `**Latest Verdict: PASS**` + count from history).

`archiveChange()` calls `buildDigest()` and writes to `digest.md`. The `summary.md` call and write are removed.

### `.claude/skills/specwork-engine/SKILL.md`

Add to the workflow section, after the verify PASS path:

```
verify PASS →
  1. Spawn specwork-summarizer (haiku) with: change=<change>, nodeId=<node>, root=<root>
  2. Wait for summarizer to write L0.md, L1.md, L2.md
  3. specwork node complete <change> <node> --json
```

### `.claude/agents/specwork-summarizer.md`

Clarify:
- **Inputs**: `change` (change name), `nodeId` (node ID), `root` (repo root path)
- **Git diff source**: `git diff HEAD~1 -- <scope paths>`
- **Verify source**: `.specwork/nodes/<change>/<nodeId>/verify.md`
- **Output files**: `L0.md` (format: `<nodeId>: <headline>`), `L1.md` (~100 tokens), `L2.md` (full diff + verify)
- **L0 format**: `<nodeId>: <one-line headline>` — no leading dash (the assembler formats it)

### `.claude/hooks/node-complete.sh`

Remove L0-writing logic. The summarizer now owns all L0/L1/L2 writes. Simplify to a no-op or empty the hook body.

### `src/cli/node.ts` — uncheckTask()

Mirror of `checkOffTask()`. Reads `tasks.md`, finds the matching group/task position, and reverts `- [x]` → `- [ ]`. Called in `failCmd` and `escalateCmd` for `impl-N-M` nodes:

```ts
function uncheckTask(root: string, change: string, nodeId: string): void {
  const tasksPath = path.join(changeDir(root, change), 'tasks.md');
  if (!fs.existsSync(tasksPath)) return;

  const match = /^impl-(\d+)-(\d+)$/.exec(nodeId);
  if (!match) return;

  const targetGroup = parseInt(match[1], 10);
  const targetTask = parseInt(match[2], 10);

  const content = fs.readFileSync(tasksPath, 'utf-8');
  const lines = content.split('\n');

  let currentGroup = 0;
  let taskInGroup = 0;

  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      currentGroup++;
      taskInGroup = 0;
      continue;
    }
    if (/^- \[x\]/.test(lines[i])) {
      taskInGroup++;
      if (currentGroup === targetGroup && taskInGroup === targetTask) {
        lines[i] = lines[i].replace('- [x]', '- [ ]');
        fs.writeFileSync(tasksPath, lines.join('\n'), 'utf-8');
        return;
      }
    }
  }
}
```

**Note on task counter parity**: `uncheckTask` increments the task counter on `- [x]` lines while `checkOffTask` increments on `- [ ]` lines. This means if a mix of checked and unchecked lines exists within a group, the counters diverge. This is acceptable: the expected workflow is that tasks within a group complete sequentially, so a fail on `impl-N-M` means `impl-N-M` was the last one checked — the earlier ones (`impl-N-1` through `impl-N-(M-1)`) are `- [x]` and their counter contribution is correct.

### `src/cli/node.ts` — Convention line matching for write-tests/integration

`checkOffTask` is extended to also match convention lines when nodeId is `write-tests` or `integration`:

```ts
// In checkOffTask, add before the impl-N-M guard:
const conventionPrefixes: Record<string, string> = {
  'write-tests': 'write-tests:',
  'integration': 'integration:',
};
const prefix = conventionPrefixes[nodeId];
if (prefix) {
  // Scan for - [ ] write-tests: ... or - [ ] integration: ...
  for (let i = 0; i < lines.length; i++) {
    const conventionMatch = new RegExp(`^- \\[ \\] ${prefix}`).exec(lines[i]);
    if (conventionMatch) {
      lines[i] = lines[i].replace('- [ ]', '- [x]');
      fs.writeFileSync(tasksPath, lines.join('\n'), 'utf-8');
      return;
    }
  }
  return; // not found, no-op
}
```

### `src/core/graph-generator.ts` — Skip convention lines in parseTasks

`parseTasks` must not create `impl-N-M` nodes for convention lines. Add a guard in the checkbox regex branch:

```ts
// Skip write-tests and integration convention lines
if (/^- \[\s*[ x]?\s*\]\s+(?:write-tests|integration):/.test(line)) {
  continue; // not an impl task
}
```

## Risks / Trade-offs

- [Summarizer failure] → `node complete` still works (reads whatever L0.md exists; null if absent). No blocking dependency.
- [Context bundle size] → Large snapshots inflate JSON output. Acceptable: JSON is consumed by agents, not displayed to users.
- [digest.md missing verify data] → Nodes without verify.md (e.g., snapshot nodes) appear in timeline with L0 only — that is correct behavior for deterministic nodes.
