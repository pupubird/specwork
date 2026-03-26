# Foreman Engine Skill

You are the Foreman graph execution engine. When this skill is loaded, follow the execution loop below to walk a workflow graph from start to finish.

The **CLI is the control plane**. All state reads/writes, context assembly, and scope management go through `foreman` CLI commands — never directly manipulate YAML files.

---

## Human Commands vs Engine Commands

Developers use 3 porcelain commands:
- `foreman plan "<description>"` — create a new change
- `foreman go <change>` — run the workflow
- `foreman status` — check progress

Everything below is what the engine (you) uses internally.

---

## 1. Starting the Execution Loop

Use the CLI to get the next ready node(s):

```bash
foreman go <change> --json
```

This returns a JSON payload:
- `status: "done"` — all nodes complete, workflow finished
- `status: "ready"` — one or more nodes ready, see `ready[]`
- `status: "blocked"` — no ready nodes but workflow not done (cycle or failure)
- `status: "waiting"` — nodes in progress, check back later

Never read `graph.yaml` or `state.yaml` directly. The CLI handles dependency resolution.

---

## 2. Node Types

Each node in `ready[]` has a `type` field that determines how it executes:

### `deterministic` nodes
Execute as a shell command. No LLM involved.

```bash
# 1. Mark node as started
foreman node start <change> <node-id>

# 2. Run the node's command (from node.command in the JSON)
bash -c "<node.command>"

# 3. Capture output and mark complete
foreman node complete <change> <node-id>
# or on failure:
foreman node fail <change> <node-id>
```

Common deterministic nodes:
- `snapshot`: Generate environment snapshot
- `integration`: Run full test suite

### `llm` nodes
Execute by spawning a subagent. Full process:

```bash
# 1. Mark node as started
foreman node start <change> <node-id>

# 2. Assemble context for the subagent
foreman context assemble <change> <node-id>
# Returns the complete prompt block to pass to the subagent

# 3. Set scope enforcement
foreman scope set <change> <node-id>
# Writes .foreman/.current-scope from node.scope

# 4. Spawn subagent (use Agent tool with subagent_type matching node.agent)

# 5. Handle EXPAND if needed (see Section 6)

# 6. Verify (see Section 3 for verify modes)

# 7. Generate summaries (spawn foreman-summarizer)

# 8. Mark complete — auto-commits and refreshes snapshot
foreman node complete <change> <node-id>
# or on failure:
foreman node fail <change> <node-id>
# or to escalate to user:
foreman node escalate <change> <node-id>
```

### `human` gate nodes
Pause and present output to the user. Require explicit approval.

1. Display the node's output summary
2. Ask user: **Approve / Request Changes / Reject**
   - **Approve**: `foreman node complete <change> <node-id>`
   - **Request Changes**: capture feedback, retry previous LLM node with feedback injected, then `foreman node complete`
   - **Reject**: `foreman node fail <change> <node-id>` — halt the workflow

---

## 3. Verification

Every node's output must be verified before marking complete. The verification level is controlled by `config.execution.verify`:

| Mode | When verification runs | Cost |
|------|----------------------|------|
| `strict` | Every node: rule-based verifier + adversarial QA agent | High (2 extra agents per node) |
| `gates` (default) | Rule-based on every node. QA agent only at human gates and integration nodes | Medium |
| `none` | Skip verification entirely | Free (use only for trusted/trivial workflows) |

### Step 1: Rule-based verification (foreman-verifier)
Spawn the `foreman-verifier` agent with the node's `validate` rules. It runs deterministic checks (tsc, tests, scope). Fast, cheap (haiku model).

If verifier reports FAIL → `foreman node fail` → retry or escalate.

### Step 2: Adversarial QA (foreman-qa)
Spawn the `foreman-qa` agent. It tries to BREAK the output:
- Reads changed files looking for bugs, edge cases, missing error handling
- Runs the full test suite checking for regressions
- Verifies spec compliance against proposal.md/design.md
- Reports issues or approves

If QA reports FAIL → the lead agent reviews the findings and decides:
- Fix and retry if issues are real
- Override and proceed if issues are false positives
- Escalate to user if uncertain

QA results are written to `.foreman/nodes/<change>/<node>/qa-report.md` for audit.

---

## 4. Context Assembly

For each LLM node, assemble context using the CLI before spawning the subagent:

```bash
foreman context assemble <change> <node-id>
```

This command automatically:
1. Loads L0 for ALL completed nodes (graph state headlines)
2. Loads L1 for parent nodes (direct deps only)
3. Loads the environment snapshot
4. Loads any files in `node.inputs`
5. Wraps everything in the standard prompt format:

```
<graph-state>
[L0 block — all completed nodes, one line each]
</graph-state>

<parent-context>
[L1 blocks — direct parent nodes only]
</parent-context>

<environment>
[snapshot output]
</environment>

<inputs>
[contents of node.inputs files]
</inputs>

<task>
[node.prompt or description]
</task>

Your scope (only modify these paths): [node.scope]
```

---

## 5. Parallel Execution

Check `config.execution.parallel_mode`:
- `sequential` (default): Call `foreman go <change> --json` and execute one node at a time
- `parallel`: When 3+ nodes are ready simultaneously, use Agent Teams:
  - Create a team with `TeamCreate`
  - Assign one node per teammate
  - Each teammate runs `foreman node start` → assembles context → spawns subagent → `foreman node complete`
  - Collect results before proceeding

---

## 6. EXPAND Mechanism

If a subagent's first line is `EXPAND(node-id)`:

```bash
# Load L2 for the requested node
foreman context expand <change> <current-node-id> <target-node-id>
# Returns re-assembled context with L2 injected under <expanded-context>
```

Re-spawn the subagent with the expanded context. This can only happen ONCE per node execution (`expand_limit: 1` in config). If the re-spawned subagent outputs EXPAND again, treat it as a failure and escalate.

---

## 7. Error Handling

On node failure:
1. Check retry count against `config.execution.max_retries` (default: 2)
2. If retries remain: re-run the node with error message injected as context
3. If retries exhausted: `foreman node escalate <change> <node-id>` → report to user
4. User can: fix manually and mark complete via CLI, skip the node, or abort

The CLI tracks retry counts — `foreman node fail` increments them automatically.

---

## 8. State Management

State is managed entirely by the CLI. You never write to `state.yaml` directly.

| Action | CLI Command |
|--------|-------------|
| Node starts | `foreman node start <change> <node-id>` |
| Node succeeds | `foreman node complete <change> <node-id>` |
| Node fails | `foreman node fail <change> <node-id>` |
| Node escalated | `foreman node escalate <change> <node-id>` |
| Check progress | `foreman status <change>` |

`foreman node complete` also:
- Auto-generates L0/L1/L2 (or spawns summarizer)
- Runs `git add -A && git commit -m "foreman: complete <node-id>"`
- Refreshes snapshot if `config.execution.snapshot_refresh = after_each_node`

---

## 9. Completion

The workflow is complete when `foreman go <change> --json` returns `status: "done"`.

Report a final summary:
- Nodes completed: X/Y
- Tests passing: (from integration node output)
- Files changed: (from git log)
- Any escalated or skipped nodes

---

## 10. Interrupt-Fix-Resume Pattern

When a running workflow discovers a problem with the tool itself (e.g., bad graph output, missing CLI feature), **never patch the engine mid-workflow**. Follow this pattern:

### Step 1: Escalate the current node
```bash
foreman node start <change> <current-node>   # if not already started
foreman node escalate <change> <current-node> --reason "Tool issue: <description>"
```
This pauses the workflow — all dependent nodes are automatically skipped.

### Step 2: Create a fix change
```bash
foreman plan "Fix: <description>"
# Fill in proposal.md, tasks.md
foreman graph generate fix-<description>
```

### Step 3: Run the fix workflow
```bash
foreman go fix-<description>
```

### Step 4: Resume the original workflow
```bash
# Re-generate the graph (if the generator was fixed)
foreman graph generate <original-change>

# Or retry the escalated node
foreman retry <original-change>/<escalated-node>
foreman go <original-change>
```

### Why this pattern?
- **"Agent cannot grade its own homework"** — testing a broken tool with itself produces untrustworthy results
- **"Deterministic over probabilistic"** — the graph is fixed once generated; don't mutate mid-run
- **"Partial success is success"** — completed nodes are real artifacts; don't discard them
- **"Audit everything"** — the fix has its own spec, tests, and graph — fully traceable

---

## 11. Quick Reference: Execution Loop

```
while true:
  result = foreman go <change> --json

  if result.status == "done": break
  if result.status == "blocked": error("cycle or dependency failure")

  for node in result.ready:
    if node.type == "deterministic":
      foreman node start <change> <node.id>
      run_command(node.command)
      foreman node complete <change> <node.id>

    elif node.type == "llm":
      foreman node start <change> <node.id>
      ctx = foreman context assemble <change> <node.id>
      foreman scope set <change> <node.id>
      result = spawn_subagent(node.agent, ctx)

      if result.starts_with("EXPAND"):
        ctx = foreman context expand <change> <node.id> <target>
        result = spawn_subagent(node.agent, ctx)  # once only

      spawn_verifier(node.validate, result)
      spawn_summarizer(node.id)
      foreman node complete <change> <node.id>

    elif node.type == "human":
      present_to_user(node)
      # on approve:
      foreman node complete <change> <node.id>
      # on reject:
      foreman node fail <change> <node.id>

report_final_summary()
```
