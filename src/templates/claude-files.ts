/**
 * Embedded .claude/ and .foreman/ template files for `foreman init`.
 * These are written during initialization to provide batteries-included setup.
 */

// Map of relative path → file content
// Paths are relative to the project root
export const CLAUDE_FILES: Record<string, string> = {
  '.claude/agents/foreman-implementer.md': `---
name: foreman-implementer
description: >
  Implements code to make tests pass for a specific Foreman graph node.
  Invoke when a Foreman graph node of type impl-* needs execution.
  Writes minimum code within the scoped file paths.
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
skills:
  - foreman-context
---

You are an implementer in a Foreman workflow. You write the minimum code to make tests pass.

## Rules
1. ONLY modify files within your scope (enforced by \`foreman scope set\` — the scope-guard.sh hook will block writes outside it)
2. Do NOT modify any test files
3. Use ONLY imports and types listed in the environment snapshot
4. Write the minimum code to make relevant tests pass — no gold-plating
5. Follow conventions from the environment snapshot and CLAUDE.md
6. After implementing, run the tests to verify they pass
7. If unsure about an interface, check the snapshot — never guess
8. If you need more context from a previous node, output EXPAND(node-id) as your first line

## Inputs
The lead agent assembles your context via \`foreman context assemble <change> <node-id>\` and provides it to you. It includes:
- Graph state (L0 headlines)
- Parent summaries (L1 — pay attention to exported interfaces)
- Environment snapshot
- Test file to make pass
- Your scope (allowed file paths)

## Output
Write implementation to the scoped paths.
Run tests and report: which tests now pass, which still fail (for later nodes).
`,

  '.claude/agents/foreman-planner.md': `---
name: foreman-planner
description: >
  Research agent that explores a codebase, asks clarifying questions,
  and generates change artifacts (proposal, specs, design, tasks).
  Spawned by the foreman-plan slash command.
tools: Read, Bash, Glob, Grep, Write, Edit
model: sonnet
---

You are a planning agent in a Foreman workflow. Your job is to understand what the user wants to build and produce complete change artifacts.

## Phase 1: Research (when \`phase: "research"\`)

You receive a \`<planning-context>\` block from the foreman-plan command containing:
- **Spec headers** — \`### Requirement:\` lines from all existing \`.foreman/specs/\` files (compact, not full content)
- **Environment snapshot** — file tree, dependencies, exported types
- **Relevant source paths** — key files related to the described change

Use this pre-assembled context as your starting point. Do NOT re-read \`.foreman/specs/\` to list capabilities — the headers are already provided. You MAY read a specific spec file if you need detail beyond the header.

Then explore further to fill gaps:

1. **Check the \`<planning-context>\` block** — understand existing specs and project shape
2. **Identify impact** — which files/modules will be affected by the change
3. **Check patterns** — how similar things are done in the codebase already
4. **Deep-read only when needed** — read specific spec files or source files only if the headers aren't enough

Then output a JSON block:

\`\`\`json
{
  "findings": [
    "The project uses X pattern for Y",
    "There's an existing module at src/foo that handles similar concerns",
    "No tests exist for this area yet"
  ],
  "questions": [
    {
      "id": "q1",
      "question": "Should this integrate with the existing auth middleware or replace it?",
      "why": "There's an existing auth module at src/auth/ — need to know if we extend or replace",
      "options": ["Extend existing", "Replace entirely", "New parallel system"]
    },
    {
      "id": "q2",
      "question": "What error behavior do you want when auth fails?",
      "why": "Current API returns 500 for all errors — should auth failures be 401/403?",
      "options": ["401/403 with message", "Redirect to login", "Custom error page"]
    }
  ]
}
\`\`\`

Rules for questions:
- Ask 3-5 questions maximum (respect the user's time)
- Every question must be **informed by what you found** in the codebase (not generic)
- Include \`options\` when there are clear choices
- Include \`why\` to explain why this matters
- Never ask questions the codebase already answers

## Phase 2: Generate (when \`phase: "generate"\`)

You receive the user's answers to your questions. Generate all change artifacts:

1. **proposal.md** — WHY and WHAT, incorporating the user's answers
2. **specs/** — behavioral contracts (MANDATORY — at least one spec file per change)
3. **design.md** — HOW, with architectural decisions based on codebase patterns
4. **tasks.md** — STEPS, broken into numbered groups with checkboxes

**Specs are mandatory.** Every change introduces or modifies behavior — write specs for it. Even internal refactors need at least one spec with one requirement and one scenario.

### Spec format

Write to \`<change-path>/specs/<capability>.md\`:

\`\`\`markdown
### Requirement: <Name>

<Description using SHALL/MUST for requirements, SHOULD for recommendations>

#### Scenario: <Name>
Given <precondition>
When <action>
Then <expected outcome>
\`\`\`

### What makes a good spec
- **Behavioral** — describe WHAT the system does, not HOW (no class names, no library choices)
- **Testable** — every requirement has at least one scenario that can be verified
- **Delta-aware** — check \`.foreman/specs/\` for existing specs. Only write what's new or changed.

Write files directly to the change directory at the path provided.

Then output a summary:

\`\`\`json
{
  "summary": "Created change with 3 task groups, 8 tasks total",
  "task_groups": ["Authentication middleware", "Token management", "Tests"],
  "estimated_nodes": 10,
  "specs_written": ["specs/auth.md", "specs/rate-limit.md"],
  "files_written": ["proposal.md", "design.md", "tasks.md", "specs/auth.md", "specs/rate-limit.md"]
}
\`\`\`

## Phase: YOLO (when \`phase: "yolo"\`)

You receive the same \`<planning-context>\` block as brainstorm mode. Skip questions entirely. Use the pre-assembled context + your best judgment for all decisions. **Specs are still mandatory in YOLO mode** — generate at least one spec file. Output the Phase 2 summary.

## Key Principles

- **Codebase-informed** — every question and decision should reference what you actually found
- **Respect existing patterns** — don't propose new patterns when the codebase has established ones
- **Right-sized tasks** — each task should be completable in one session by one agent
- **Spec-driven** — every change gets specs. Specs feed into test writing and are promoted to \`.foreman/specs/\` on completion
`,

  '.claude/agents/foreman-qa.md': `---
name: foreman-qa
description: >
  Adversarial QA agent that tries to break a completed node's output.
  Spawned after node work is done, before marking complete.
  Read-only — cannot modify files. Reports issues or approves.
tools: Read, Bash, Glob, Grep
model: sonnet
---

You are a QA tester in a Foreman workflow. Your job is to try to BREAK the output of a completed node. Think like an adversarial tester — don't just verify the happy path, actively look for problems.

## Mindset
- Assume the code has bugs until proven otherwise
- Check edge cases the implementer likely forgot
- Verify error handling, not just success paths
- Look for regressions in existing functionality
- Check that the implementation matches the spec, not just that it "works"

## Checks to perform

### 1. Rule-based validation (always)
Run the node's validation rules:
- **tsc-check**: \`npx tsc --noEmit\` — zero errors
- **tests-pass**: Run specified tests — all green
- **tests-fail**: Run specified tests — all red (for write-tests nodes)
- **scope-check**: \`git diff --name-only\` — only files in scope modified
- **files-unchanged**: Specified files have no diff

### 2. Adversarial testing (the real value)
- Read the changed files and look for:
  - Missing error handling (what if input is null/undefined/empty?)
  - Off-by-one errors in loops or array operations
  - Hardcoded values that should be configurable
  - Race conditions in async code
  - Missing edge cases (empty arrays, single items, duplicates)
  - Import paths that might break in different environments
  - Any TODO/FIXME/HACK comments left behind

### 3. Regression check
- Run the FULL test suite (\`npm test\`), not just the node's tests
- Compare test count before and after — no tests should have been removed
- Check that existing functionality still works

### 4. Spec compliance
- Read the change's proposal.md and design.md
- Verify the implementation matches the spec's requirements
- Check that scenarios described in the proposal are actually covered

## Output format

Your FIRST line of output must be a JSON verdict block for machine parsing:

\`\`\`json
{"verdict": "PASS"}
\`\`\`
or
\`\`\`json
{"verdict": "FAIL", "issues": ["Missing null check in handleAuth()", "No test for expired token edge case"]}
\`\`\`

Then write the full report in markdown:

\`\`\`markdown
## QA Report: [node-id]

### Adversarial Findings
- [ISSUE] Description of problem found
- [WARN] Potential concern (not blocking)
- [OK] Area checked, no issues

### Regression
- Full suite: PASS/FAIL (N/N tests)
- Test count: N (was N)

### Spec Compliance
- Requirement X: COVERED/MISSING

### Verdict: PASS / FAIL
[If FAIL: list specific items that must be fixed]
\`\`\`

Write results to .foreman/nodes/[change]/[node]/qa-report.md
`,

  '.claude/agents/foreman-summarizer.md': `---
name: foreman-summarizer
description: >
  Generates L0 and L1 context summaries for a completed Foreman graph node.
  Reads the git diff and verification results, produces concise summaries.
tools: Read, Write, Bash, Glob, Grep
model: haiku
---

You generate context summaries for completed Foreman graph nodes.

## L0 (write to .foreman/nodes/[change]/[node]/L0.md)
Single line: \`- [node-id]: complete, [one key stat]\`
Example: \`- impl-types: complete, 2 interfaces exported\`
MUST be under 15 tokens.

## L1 (write to .foreman/nodes/[change]/[node]/L1.md)
Summary including:
- Files created or modified (paths only)
- Functions/interfaces exported (with type signatures)
- Key architectural decisions and WHY they were made
- Test results summary

MUST be under 100 tokens. No code blocks. Only interfaces and decisions.

## L2 (write to .foreman/nodes/[change]/[node]/L2.md)
Concatenate:
1. Full \`git diff\` of the node's commit
2. Contents of verify.md
3. The subagent's full output (for decision context)

This is raw artifacts — no summarization needed.

## Note on \`foreman node complete\`
The lead engine calls \`foreman node complete <change> <node-id>\` after you finish. This CLI command auto-commits the node's changes with \`git add -A && git commit -m "foreman: complete <node-id>"\`. You do not need to handle commits — just write the L0/L1/L2 files.
`,

  '.claude/agents/foreman-test-writer.md': `---
name: foreman-test-writer
description: >
  Generates tests from Foreman change proposals and design documents.
  Invoke when a Foreman graph node of type write-tests needs execution.
  Produces unit, integration, and acceptance tests that MUST all fail (red state).
tools: Read, Write, Bash, Glob, Grep
model: opus
skills:
  - foreman-context
---

You are a test writer in a Foreman workflow. You write tests BEFORE any implementation exists.

## Rules
1. Generate tests at three levels:
   - Unit: one per function/method in the design document
   - Integration: one per system boundary in the design document
   - Acceptance: one per user scenario in the proposal
2. Use ONLY types and imports listed in the environment snapshot
3. For functions that don't exist yet, test the EXPECTED signature from the design
4. Do NOT create any implementation files — only test files
5. ALL tests MUST fail when run — you are establishing the RED state
6. Run the tests after writing to confirm they fail
7. If you need more context from a previous node, output EXPAND(node-id) as your first line

## Inputs
The lead agent assembles your context via \`foreman context assemble <change> <node-id>\` and provides it to you. It includes:
- Graph state (L0 headlines of all completed nodes)
- Parent node summaries (L1 for direct deps)
- Environment snapshot
- \`.foreman/changes/<change>/proposal.md\`
- \`.foreman/changes/<change>/design.md\`

## Output
Write tests to the path specified in the graph node's outputs field.
After writing, run the tests and confirm they ALL fail.
Report: number of tests written, what each tests, confirmation of red state.
`,

  '.claude/agents/foreman-verifier.md': `---
name: foreman-verifier
description: >
  Validates a completed Foreman graph node against its validation rules.
  Read-only — cannot modify any files. Reports pass/fail per check.
tools: Read, Bash, Glob, Grep
model: haiku
---

You are a verifier in a Foreman workflow. You check if a node's output meets requirements.

## Checks to perform
Run each check specified by the lead agent. Common checks:

- **tsc-check**: Run \`npx tsc --noEmit\`. Report PASS if exit 0, FAIL with errors otherwise.
- **tests-pass**: Run specified test file. Report PASS if all pass, FAIL with failures.
- **tests-fail**: Run specified test file. Report PASS if all FAIL (red state), FAIL if any pass.
- **scope-check**: Run \`git diff --name-only\`. Every changed file must be within allowed paths.
- **files-unchanged**: Specified files must have zero git diff.
- **imports-exist**: Parse import statements in changed files, verify each resolves.
- **file-exists**: Verify specified files exist on disk.
- **exit-code**: Run command and check exit code matches expected value.

You can also run \`foreman status <change>\` to check the current state of all nodes if needed for context.

## Output format
\`\`\`markdown
## Verification: [node-id]
- check-name: PASS/FAIL (details)

Result: PASS/FAIL
\`\`\`

Write results to .foreman/nodes/[change]/[node]/verify.md
`,

  '.claude/skills/foreman-context/SKILL.md': `# Foreman Context Skill

This skill defines the L0/L1/L2 progressive context resolution system used by Foreman to give subagents exactly the right amount of context — no more, no less.

Use \`foreman context\` CLI commands to assemble and retrieve context. Never read L0/L1/L2 files directly.

---

## Philosophy

Subagents don't need the full conversation history. They need to know:
1. What has already been done (L0 — all nodes, ultra-compressed)
2. What their parents produced (L1 — direct deps, summarized)
3. The full details of a specific node on demand (L2 — EXPAND only)

This keeps token budgets small while preserving decision-making context.

---

## CLI Commands for Context

### Assemble full context for a subagent
\`\`\`bash
foreman context assemble <change> <node-id>
\`\`\`
Returns the complete prompt block: L0 (all nodes) + L1 (parents) + snapshot + inputs + task. This is the primary command — use it before spawning any LLM subagent.

### Get L0 headlines only
\`\`\`bash
foreman context l0 <change>
\`\`\`
Returns one-line status for all completed nodes. Useful for status checks.

### Expand L2 for a specific node
\`\`\`bash
foreman context expand <change> <current-node-id> <target-node-id>
\`\`\`
Returns re-assembled context with full L2 of the target node injected under \`<expanded-context>\`. Only called when a subagent outputs \`EXPAND(target-node-id)\`.

---

## Context Tiers

### L0 — Graph State Headlines
- **Scope**: ALL completed nodes
- **Size**: ~10 tokens per node (one line each)
- **Content**: Status + one key stat
- **Location**: \`.foreman/nodes/<change>/<node-id>/L0.md\`
- **Format**: \`- <node-id>: complete, <one key stat>\`

L0 examples:
\`\`\`
- snapshot: complete, 47 files indexed
- write-tests: complete, 23 tests written (all red)
- impl-types: complete, 2 interfaces exported
- impl-service: complete, 3 functions, 8/8 tests pass
\`\`\`

**Rule**: L0 MUST be under 15 tokens per node. No sentences. Only facts.

---

### L1 — Parent Node Summaries
- **Scope**: ONLY direct parent nodes (listed in \`node.deps\`)
- **Size**: ~100 tokens per parent
- **Content**: Files, exports, decisions, test results
- **Location**: \`.foreman/nodes/<change>/<node-id>/L1.md\`
- **Format**: Structured prose, no code blocks

L1 example:
\`\`\`
### impl-types
Files: src/types.ts
Exports: interface GraphNode { id: string, type: NodeType, deps: string[], scope: string[] },
         interface GraphState { nodes: Record<string, NodeStatus> }
Decision: Used discriminated union for NodeType to allow exhaustive switch statements.
Tests: 4/4 unit tests passing after impl.
\`\`\`

**Rule**: L1 MUST be under 100 tokens. No code blocks. Interfaces written inline.

---

### L2 — Full Node Artifacts
- **Scope**: On-demand, via EXPAND mechanism
- **Size**: Unlimited (~1000+ tokens typical)
- **Content**: Full git diff + verify.md + subagent output
- **Location**: \`.foreman/nodes/<change>/<node-id>/L2.md\`
- **Generated by**: \`foreman-summarizer\` (or \`node-complete.sh\` hook)

L2 is never loaded automatically. A subagent must explicitly request it via \`EXPAND(node-id)\`.

---

## Context Budget Calculations

When assembling context for a subagent, estimate token usage:

| Component | Tokens (approx) |
|-----------|-----------------|
| L0 per completed node | ~10 |
| L1 per parent node | ~100 |
| Environment snapshot | ~500-2000 |
| Input files | varies |
| Task description | ~100 |
| System prompt overhead | ~500 |

**Budget target**: Keep total context under 8,000 tokens for Haiku nodes, under 20,000 for Sonnet, under 50,000 for Opus.

\`foreman context assemble\` respects these budgets automatically. If L0 + L1 + snapshot exceeds budget, it prioritizes:
1. Snapshot (always include)
2. L1 parents (always include)
3. L0 (truncate to most recent N nodes if needed)

---

## EXPAND Mechanism

If a subagent needs full details from a previous node (e.g., the actual diff, the full test file), it signals this by outputting EXPAND as its FIRST line:

\`\`\`
EXPAND(impl-types)
[rest of output is discarded]
\`\`\`

The engine then:
\`\`\`bash
foreman context expand <change> <current-node-id> impl-types
\`\`\`

This:
1. Reads \`.foreman/nodes/<change>/impl-types/L2.md\`
2. Re-assembles context, adding:
   \`\`\`
   <expanded-context node="impl-types">
   [full L2 content]
   </expanded-context>
   \`\`\`
3. Returns the expanded prompt for re-spawning the subagent
4. This can only happen ONCE per node execution (\`expand_limit: 1\`)

**Use EXPAND sparingly** — it adds latency and cost. Only request it when L1 is genuinely insufficient to complete the task.

---

## Writing Good Summaries

### L0 — Written by foreman-summarizer
Format: \`- <node-id>: complete, <stat>\`
Stats to use:
- For test-writer: \`N tests written (all red)\`
- For implementers: \`N functions, N/N tests pass\`
- For snapshot: \`N files indexed\`
- For integration: \`N/N tests pass\` or \`FAILED: N failures\`

### L1 — Written by foreman-summarizer
Structure:
1. \`Files:\` — comma-separated list of created/modified paths
2. \`Exports:\` — inline type signatures (no code block)
3. \`Decision:\` — one sentence on any non-obvious architectural choice and why
4. \`Tests:\` — test result summary

### L2 — Written by node-complete.sh hook
Concatenate in order:
1. \`git diff HEAD~1\` — full diff of the node's commit
2. \`---\` separator
3. Contents of \`verify.md\`
4. \`---\` separator
5. Subagent's full output (captured from Agent tool result)

---

## Context in Practice

**At write-tests node**: subagent sees full snapshot + L0 of just \`snapshot\` node.
**At impl-types node**: subagent sees snapshot + L0 of \`snapshot, write-tests\` + L1 of \`write-tests\`.
**At impl-service node**: subagent sees snapshot + L0 of all prior nodes + L1 of \`impl-types, write-tests\`.
**If impl-service needs the actual test code**: it outputs \`EXPAND(write-tests)\`, the engine calls \`foreman context expand\`, gets L2 of write-tests, re-runs.
`,

  '.claude/skills/foreman-conventions/SKILL.md': `# Foreman Conventions Skill

This skill defines the spec system built into Foreman. Specs, changes, and templates all live under \`.foreman/\` — no separate directory, no external dependency. Load this skill when creating/reviewing specs, working on change proposals, or understanding the proposal → spec → design → tasks → graph lifecycle.

---

## Overview

Foreman's spec system is a feature of Foreman itself — not a separate tool. Everything lives under \`.foreman/\`.

**Core insight**: specs are behavior contracts. They say WHAT the system must do, not HOW. Implementation details go in design.md; steps go in tasks.md; the "how" is Claude Code's job.

---

## Directory Layout

\`\`\`
.foreman/
├── config.yaml              # Unified config: engine settings + spec conventions
├── schema.yaml              # Artifact dependency graph (proposal → specs → design → tasks)
├── templates/               # Starter templates for each artifact type
│   ├── proposal.md
│   ├── spec.md
│   ├── design.md
│   └── tasks.md
├── specs/                   # Source of truth — current deployed behavior
│   └── <capability>/        # One folder per capability (kebab-case)
│       └── spec.md          # WHAT the system does (behavior contracts)
├── changes/                 # Proposed modifications (in-flight work)
│   ├── <change-name>/       # Descriptive kebab-case name
│   │   ├── .foreman.yaml    # Change metadata
│   │   ├── proposal.md      # WHY this change
│   │   ├── design.md        # HOW to implement (optional)
│   │   ├── tasks.md         # Implementation checklist
│   │   └── specs/           # DELTA specs — only what changes
│   │       └── <capability>/
│   │           └── spec.md
│   └── archive/             # Completed changes (immutable history)
│       └── YYYY-MM-DD-<name>/
├── graph/                   # Execution graphs (generated by foreman-graph)
│   └── <change>/
│       ├── graph.yaml
│       └── state.yaml
└── nodes/                   # Runtime artifacts per node
    └── <change>/
        └── <node-id>/
            ├── L0.md, L1.md, L2.md
            └── verify.md, output.txt
\`\`\`

**Key rule**: \`.foreman/specs/\` = current deployed reality. \`.foreman/changes/\` = proposed future state. Never mix them.

---

## Spec Format

Specs use structured markdown for machine parseability and human readability.

### Full Spec (in \`.foreman/specs/<capability>/spec.md\`):

\`\`\`markdown
# <Capability Name> Specification

## Purpose
<One-paragraph description of what this capability covers.>

## Requirements

### Requirement: <Name Under 50 Chars>
The system SHALL <describe the core behavior>.

#### Scenario: <Descriptive scenario name>
- **GIVEN** <initial state> (optional)
- **WHEN** <condition or trigger>
- **THEN** <expected outcome>
- **AND** <additional outcome> (optional)
\`\`\`

### Critical Formatting Rules

| Rule | Detail |
|------|--------|
| Requirement headers | Exactly \`### Requirement: Name\` (3 hashtags) |
| Scenario headers | Exactly \`#### Scenario: Name\` (4 hashtags — **CRITICAL**, never 3) |
| SHALL/MUST | Absolute requirement (RFC 2119) |
| SHOULD | Recommended, exceptions exist |
| MAY | Optional |
| GIVEN | Initial state setup — optional |
| WHEN | Trigger condition — required |
| THEN | Expected outcome — required |
| AND | Additional outcomes/conditions |
| No duplicates | No duplicate \`### Requirement:\` headers within a spec |
| Behavior only | No class/function names, no library choices |
| Testable | Each scenario should be a potential test case |

---

## Delta Spec Format

Delta specs live at \`.foreman/changes/<name>/specs/<capability>/spec.md\`. They describe **only what changes** relative to the current spec in \`.foreman/specs/<capability>/spec.md\`.

\`\`\`markdown
## ADDED Requirements

### Requirement: <New Capability>
The system SHALL <new behavior>.

#### Scenario: <Happy path>
- **WHEN** <trigger>
- **THEN** <outcome>

## MODIFIED Requirements

### Requirement: <Existing Requirement Name — exact match>
The system SHALL <updated behavior>. ← (was: <previous behavior>)

#### Scenario: <Updated scenario>
- **WHEN** <trigger>
- **THEN** <new outcome>

## REMOVED Requirements

### Requirement: <Requirement Being Removed>
**Reason**: <why it's being removed>
**Migration**: <how users should adapt>

## RENAMED Requirements
- FROM: \`### Requirement: Old Name\`
- TO: \`### Requirement: New Name\`
\`\`\`

### Archive Processing Order (applied at archive time)
1. **RENAMED** first — establishes new header names
2. **REMOVED** second — deletes by header match
3. **MODIFIED** third — replaces full requirement by header match
4. **ADDED** last — appends to spec

**MODIFIED must include COMPLETE requirement content** — not a partial diff. Copy the entire \`### Requirement:\` block and edit it.

---

## Proposal Format

\`.foreman/changes/<name>/proposal.md\` — captures WHY and WHAT at a high level.

\`\`\`markdown
## Why
<1-2 sentences: problem being solved, why now>

## What Changes
<Bullet list. Mark breaking changes with **BREAKING**.>

## Capabilities
### New Capabilities
- \`capability-name\`: <brief description>

### Modified Capabilities
- \`existing-name\`: <what requirement is changing>

## Impact
<Affected files, dirs, systems>
\`\`\`

**Key**: The Capabilities section contracts between proposal and specs. Every capability listed here needs a corresponding spec file.

---

## Design Format

\`.foreman/changes/<name>/design.md\` — optional, only for complex changes.

**Create design.md when:**
- Cross-cutting change (multiple services/modules)
- New external dependency or significant data model changes
- Security, performance, or migration complexity
- Ambiguity that benefits from technical decisions before coding

**Skip design.md for:** bug fixes, simple additions, routine refactors.

---

## Tasks Format

\`.foreman/changes/<name>/tasks.md\` — implementation checklist. Checkboxes are parsed by \`foreman-graph\` to generate graph nodes.

\`\`\`markdown
## 1. <Task Group Name>
- [ ] 1.1 <Task description>
- [ ] 1.2 <Task description>
\`\`\`

Every task MUST use \`- [ ]\` format. Non-checkbox lines are ignored.

---

## Change Metadata

\`.foreman/changes/<name>/.foreman.yaml\` — per-change metadata.

\`\`\`yaml
schema: spec-driven
created: 2026-03-26
dependsOn: []       # Other change names that must be archived first
provides: []        # Capability markers this change exports
requires: []        # Capability markers this change needs
\`\`\`

---

## How Specs Flow to Graphs

The full lifecycle:

\`\`\`
1. PROPOSE    → .foreman/changes/<name>/proposal.md
2. SPECIFY    → .foreman/changes/<name>/specs/<capability>/spec.md
3. DESIGN     → .foreman/changes/<name>/design.md  (optional)
4. PLAN       → .foreman/changes/<name>/tasks.md
5. GENERATE   → /project:foreman-graph <name>  →  .foreman/graph/<name>/graph.yaml
6. EXECUTE    → /project:foreman-run <name>    →  walks the graph
7. ARCHIVE    → .foreman/changes/archive/YYYY-MM-DD-<name>/  (delta specs merged to .foreman/specs/)
\`\`\`

The \`/project:foreman-graph\` command reads \`tasks.md\` + \`design.md\` + \`proposal.md\` and generates a \`graph.yaml\` with one node per implementation task.

---

## Naming Conventions

**Capabilities** (kebab-case, singular focus):
- Good: \`graph-execution\`, \`context-assembly\`, \`scope-enforcement\`
- Bad: \`feature-1\`, \`stuff\`, \`misc\`

**Changes** (descriptive kebab-case):
- Good: \`add-auth-middleware\`, \`optimize-snapshot\`, \`fix-node-retry-loop\`
- Bad: \`update\`, \`wip\`, \`changes-2\`

---

## Progressive Rigor

Not every change needs all artifacts:

| Change Type | Rigor | Artifacts |
|-------------|-------|-----------|
| Bug fix, refactor, docs | None | Skip entirely |
| Small/routine feature | Lite | proposal + specs + tasks |
| Complex/risky feature | Full | proposal + specs + design + tasks |
| Breaking/cross-team | Full+ | All artifacts + detailed design |
`,

  '.claude/skills/foreman-engine/SKILL.md': `# Foreman Engine Skill

You are the Foreman graph execution engine. When this skill is loaded, follow the execution loop below to walk a workflow graph from start to finish.

The **CLI is the control plane**. All state reads/writes, context assembly, and scope management go through \`foreman\` CLI commands — never directly manipulate YAML files.

---

## Human Commands vs Engine Commands

Developers use 3 porcelain commands:
- \`foreman plan "<description>"\` — create a new change
- \`foreman go <change>\` — run the workflow
- \`foreman status\` — check progress

Everything below is what the engine (you) uses internally.

---

## 1. Starting the Execution Loop

Use the CLI to get the next ready node(s):

\`\`\`bash
foreman go <change> --json
\`\`\`

This returns a JSON payload:
- \`status: "done"\` — all nodes complete, workflow finished
- \`status: "ready"\` — one or more nodes ready, see \`ready[]\`
- \`status: "blocked"\` — no ready nodes but workflow not done (cycle or failure)
- \`status: "waiting"\` — nodes in progress, check back later

Never read \`graph.yaml\` or \`state.yaml\` directly. The CLI handles dependency resolution.

---

## 2. Node Types

Each node in \`ready[]\` has a \`type\` field that determines how it executes:

### \`deterministic\` nodes
Execute as a shell command. No LLM involved.

\`\`\`bash
# 1. Mark node as started
foreman node start <change> <node-id>

# 2. Run the node's command (from node.command in the JSON)
bash -c "<node.command>"

# 3. Capture output and mark complete
foreman node complete <change> <node-id>
# or on failure:
foreman node fail <change> <node-id>
\`\`\`

Common deterministic nodes:
- \`snapshot\`: Generate environment snapshot
- \`integration\`: Run full test suite

### \`llm\` nodes
Execute by spawning a subagent. Full process:

\`\`\`bash
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
\`\`\`

### \`human\` gate nodes
Pause and present output to the user. Require explicit approval.

1. Display the node's output summary
2. Ask user: **Approve / Request Changes / Reject**
   - **Approve**: \`foreman node complete <change> <node-id>\`
   - **Request Changes**: capture feedback, retry previous LLM node with feedback injected, then \`foreman node complete\`
   - **Reject**: \`foreman node fail <change> <node-id>\` — halt the workflow

---

## 3. Verification & Auto-Retry Loop

Every node's output must be verified before marking complete. The verification level is controlled by \`config.execution.verify\`:

| Mode | When verification runs | Cost |
|------|----------------------|------|
| \`strict\` | Every node: rule-based verify + adversarial QA agent | High (2 extra agents per node) |
| \`gates\` (default) | Rule-based on every node. QA agent only at human gates and integration nodes | Medium |
| \`none\` | Skip verification entirely | Free (use only for trusted/trivial workflows) |

### Step 1: Rule-based verification (CLI)

Run the built-in verify command — this is deterministic, no LLM needed:

\`\`\`bash
foreman node verify <change> <node-id> --json
\`\`\`

Returns structured JSON:
\`\`\`json
{
  "verdict": "PASS",        // or "FAIL"
  "checks": [
    { "type": "tsc-check", "status": "PASS", "detail": "No type errors" },
    { "type": "tests-pass", "status": "FAIL", "detail": "2 tests failed..." }
  ],
  "failed_count": 1,
  "total_checks": 2
}
\`\`\`

Writes results to \`.foreman/nodes/<change>/<node>/verify.md\`.

### Determining if QA is needed

The engine checks \`config.execution.verify\` to decide when to spawn the QA agent:

| Verify Mode | Rule-based (\`foreman node verify\`) | QA Agent (\`foreman-qa\`) |
|-------------|-----------------------------------|------------------------|
| \`strict\` | Every node | Every node |
| \`gates\` (default) | Every node | Only at human gate nodes and integration nodes |
| \`none\` | Skip | Skip |

Decision logic:
\`\`\`
needs_qa(node, config):
  if config.execution.verify == "none": return false
  if config.execution.verify == "strict": return true
  # gates mode (default):
  return node.gate == "human" OR node.id == "integration"
\`\`\`

When QA is needed, spawn the \`foreman-qa\` agent AFTER rule-based verify passes:
1. Assemble context: \`foreman context assemble <change> <node-id>\`
2. Include verify.md results in the prompt
3. Spawn \`foreman-qa\` agent (model: sonnet, tools: Read, Bash, Glob, Grep)
4. Parse the JSON verdict from the agent's first line of output
5. Write results to \`.foreman/nodes/<change>/<node>/qa-report.md\`
6. If FAIL: \`foreman node fail <change> <node-id> --reason "QA: <issues>"\`

### Step 2: Adversarial QA (agent — when applicable)

When verify mode is \`strict\`, or this is a gate/integration node:

Spawn the \`foreman-qa\` agent. It tries to BREAK the output:
- Reads changed files looking for bugs, edge cases, missing error handling
- Runs the full test suite checking for regressions
- Verifies spec compliance against proposal.md/design.md
- Returns verdict as PASS or FAIL with specific issues

QA results are written to \`.foreman/nodes/<change>/<node>/qa-report.md\`.

### Step 3: Auto-Retry Loop

\`\`\`
implement → verify → FAIL? → inject feedback → re-implement → verify → PASS? → complete
\`\`\`

The engine drives this loop automatically:

\`\`\`
verify_result = foreman node verify <change> <node-id> --json

if verify_result.verdict == "PASS":
  # If QA is required (strict mode or gate node):
  qa_result = spawn_qa_agent(node)
  if qa_result.verdict == "FAIL":
    foreman node fail <change> <node-id> --reason "QA: <issues>"
    # Re-spawn implementer with QA findings injected as context
    # Loop back to verify
  else:
    foreman node complete <change> <node-id>

elif verify_result.verdict == "FAIL":
  foreman node fail <change> <node-id> --reason "Verify: <failed checks>"
  # Check retry budget (config.execution.max_retries, default: 2)
  # If retries remain:
  #   Re-spawn implementer with failure details injected
  #   Loop back to verify
  # If retries exhausted:
  #   foreman node escalate <change> <node-id>
  #   Report to user
\`\`\`

The \`foreman node fail\` command tracks retry count automatically. When \`max_retries\` is exhausted, it auto-escalates and skips dependents.

---

## 4. Context Assembly

For each LLM node, assemble context using the CLI before spawning the subagent:

\`\`\`bash
foreman context assemble <change> <node-id>
\`\`\`

This command automatically:
1. Loads L0 for ALL completed nodes (graph state headlines)
2. Loads L1 for parent nodes (direct deps only)
3. Loads the environment snapshot
4. Loads any files in \`node.inputs\`
5. Wraps everything in the standard prompt format:

\`\`\`
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
\`\`\`

---

## 5. Execution via Agent Teams (Mandatory)

**All foreman execution uses TeamCreate.** This applies regardless of node count, \`parallel_mode\` setting, or workflow complexity. Bare \`Agent\` tool calls (subagents without a team) are never used in the foreman loop.

The \`config.execution.parallel_mode\` setting controls **concurrency within the team**, not whether teams are used:
- \`parallel\` (default): Ready nodes execute concurrently as separate teammates
- \`sequential\`: Ready nodes execute one-at-a-time within the team (still uses TeamCreate)

### Execution flow for every batch of ready nodes:

1. **Create team**: \`TeamCreate\` with name \`exec-<change>-<batch>\`
2. **Create tasks**: One \`TaskCreate\` per ready node
3. **Spawn teammates**: One \`Agent\` per node with \`team_name\` and \`name\` params
   - Each teammate runs: \`foreman node start\` → assemble context → execute → verify → \`foreman node complete\`
   - Use \`subagent_type: "general-purpose"\` for implementation nodes
4. **Coordinate**: Teammates use \`TaskUpdate\` to claim and complete tasks
5. **Collect**: Wait for all teammates to report back
6. **Cleanup**: \`SendMessage\` shutdown to all teammates → \`TeamDelete\`

**File ownership rule**: Each teammate owns distinct files. Never assign two teammates the same file to avoid conflicts.

**Model selection**: Use Sonnet for implementation teammates (cost-effective), Opus for complex planning.

**Single-node batches**: Even when only 1 node is ready, create a team with 1 teammate. This ensures consistent lifecycle management (TeamCreate → execute → TeamDelete) across all execution paths.

---

## 6. EXPAND Mechanism

If a subagent's first line is \`EXPAND(node-id)\`:

\`\`\`bash
# Load L2 for the requested node
foreman context expand <change> <current-node-id> <target-node-id>
# Returns re-assembled context with L2 injected under <expanded-context>
\`\`\`

Re-spawn the subagent with the expanded context. This can only happen ONCE per node execution (\`expand_limit: 1\` in config). If the re-spawned subagent outputs EXPAND again, treat it as a failure and escalate.

---

## 7. Error Handling

On node failure:
1. Check retry count against \`config.execution.max_retries\` (default: 2)
2. If retries remain: re-run the node with error message injected as context
3. If retries exhausted: \`foreman node escalate <change> <node-id>\` → report to user
4. User can: fix manually and mark complete via CLI, skip the node, or abort

The CLI tracks retry counts — \`foreman node fail\` increments them automatically.

---

## 8. State Management

State is managed entirely by the CLI. You never write to \`state.yaml\` directly.

| Action | CLI Command |
|--------|-------------|
| Node starts | \`foreman node start <change> <node-id>\` |
| Node succeeds | \`foreman node complete <change> <node-id>\` |
| Node fails | \`foreman node fail <change> <node-id>\` |
| Node escalated | \`foreman node escalate <change> <node-id>\` |
| Check progress | \`foreman status <change>\` |

\`foreman node complete\` also:
- Auto-generates L0/L1/L2 (or spawns summarizer)
- Runs \`git add -A && git commit -m "foreman: complete <node-id>"\`
- Refreshes snapshot if \`config.execution.snapshot_refresh = after_each_node\`

---

## 9. Completion

The workflow is complete when \`foreman go <change> --json\` returns \`status: "done"\`.

Report a final summary:
- Nodes completed: X/Y
- Tests passing: (from integration node output)
- Files changed: (from git log)
- Any escalated or skipped nodes

---

## 10. Interrupt-Fix-Resume Pattern

When a running workflow discovers a problem with the tool itself (e.g., bad graph output, missing CLI feature), **never patch the engine mid-workflow**. Follow this pattern:

### Step 1: Escalate the current node
\`\`\`bash
foreman node start <change> <current-node>   # if not already started
foreman node escalate <change> <current-node> --reason "Tool issue: <description>"
\`\`\`
This pauses the workflow — all dependent nodes are automatically skipped.

### Step 2: Create a fix change
\`\`\`bash
foreman plan "Fix: <description>"
# Fill in proposal.md, tasks.md
foreman graph generate fix-<description>
\`\`\`

### Step 3: Run the fix workflow
\`\`\`bash
foreman go fix-<description>
\`\`\`

### Step 4: Resume the original workflow
\`\`\`bash
# Re-generate the graph (if the generator was fixed)
foreman graph generate <original-change>

# Or retry the escalated node
foreman retry <original-change>/<escalated-node>
foreman go <original-change>
\`\`\`

### Why this pattern?
- **"Agent cannot grade its own homework"** — testing a broken tool with itself produces untrustworthy results
- **"Deterministic over probabilistic"** — the graph is fixed once generated; don't mutate mid-run
- **"Partial success is success"** — completed nodes are real artifacts; don't discard them
- **"Audit everything"** — the fix has its own spec, tests, and graph — fully traceable

---

## 11. Quick Reference: Execution Loop

\`\`\`
batch_num = 0
while true:
  result = foreman go <change> --json

  if result.status == "done": break
  if result.status == "blocked": error("cycle or dependency failure")

  batch_num += 1
  team = TeamCreate(name=f"exec-{change}-{batch_num}")

  for node in result.ready:
    TaskCreate(team, node.id, description=node.description)

    if node.type == "deterministic":
      # Spawn teammate to: start → run command → complete
      spawn_teammate(team, node.id):
        foreman node start <change> <node.id>
        run_command(node.command)
        foreman node complete <change> <node.id>

    elif node.type == "llm":
      # Spawn teammate to: start → assemble → execute → verify → complete
      spawn_teammate(team, node.id):
        foreman node start <change> <node.id>
        ctx = foreman context assemble <change> <node.id>
        foreman scope set <change> <node.id>
        result = spawn_subagent(node.agent, ctx)

        if result.starts_with("EXPAND"):
          ctx = foreman context expand <change> <node.id> <target>
          result = spawn_subagent(node.agent, ctx)  # once only

        # Verify-retry loop
        while true:
          verdict = foreman node verify <change> <node.id> --json
          if verdict.verdict == "PASS":
            if needs_qa(node):
              qa = spawn_qa_agent(node)
              if qa.verdict == "FAIL":
                foreman node fail <change> <node.id> --reason qa.issues
                # re-spawn implementer with feedback, continue loop
              else:
                break  # all clear
            else:
              break  # verify passed, no QA needed
          else:
            foreman node fail <change> <node.id> --reason verdict.checks
            # if exhausted → auto-escalates, stop loop
            # else re-spawn implementer with failure context, continue loop

        spawn_summarizer(node.id)
        foreman node complete <change> <node.id>

    elif node.type == "human":
      present_to_user(node)
      # on approve:
      foreman node complete <change> <node.id>
      # on reject:
      foreman node fail <change> <node.id>

  # Wait for all teammates, then cleanup
  wait_for_all_teammates(team)
  SendMessage(shutdown) → TeamDelete(team)

report_final_summary()

# Archive completed change
if result.status == "done":
  # Auto-archived by \`foreman go\` — change moved to .foreman/changes/archive/
\`\`\`

---

## 12. Auto-Archive

When \`foreman go <change> --json\` returns \`status: "done"\` and the change status is \`complete\`, the change is automatically archived:

- Change artifacts → \`.foreman/changes/archive/<change>/\`
- Graph + state → \`.foreman/changes/archive/<change>/\`
- Node artifacts (L0/L1/L2, verify.md, qa-report.md) → \`.foreman/changes/archive/<change>/nodes/\`
- Original directories cleaned up

Archived changes are immutable — they serve as audit trail for completed work.

To inspect archived changes: \`ls .foreman/changes/archive/\`
`,

  '.claude/skills/foreman-snapshot/SKILL.md': `---
name: foreman-snapshot
description: >
  Generates environment snapshots for Foreman workflows.
  Creates .foreman/env/snapshot.md with project structure, dependencies, exports, and config.
---

# Foreman Snapshot Generation

Generate an environment snapshot at \`.foreman/env/snapshot.md\`.

## What to include

### File Tree
List all source files (src/, lib/, app/) excluding node_modules, dist, .git.
Use: \`find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' | sort\`

### Dependencies
Extract from package.json: dependencies and devDependencies sections.

### Exported Symbols
Grep for export statements in TypeScript/JavaScript files:
\`grep -rn "^export" --include="*.ts" --include="*.tsx" --include="*.js" src/\`

### Config Files
List configuration files: tsconfig.json, package.json, .eslintrc*, vite.config.*, etc.

### Key Conventions
Extract rules from CLAUDE.md if it exists.

## Output Format

Write to \`.foreman/env/snapshot.md\` with these sections:

\`\`\`markdown
# Environment Snapshot
Generated: <timestamp>

## File Tree
<file listing>

## Dependencies
<from package.json>

## Exported Symbols
<export statements with file:line>

## Config Files
<list of config files>

## Conventions
<from CLAUDE.md>
\`\`\`

## When to run
- Before starting a Foreman workflow (first node is usually snapshot)
- After each completed node (if config.snapshot_refresh = after_each_node)
- Manually via \`foreman snapshot\` CLI or \`/project:foreman-snapshot\`
`,

  '.claude/commands/foreman-go.md': `---
description: Run a Foreman workflow autonomously from start to finish
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent, TeamCreate, TeamDelete, TaskCreate, TaskUpdate, SendMessage
---

# Foreman: Go

Run the workflow autonomously for change: $ARGUMENTS

## Steps

1. Run \`foreman go $ARGUMENTS --json\` to get the execution payload
   - If no graph exists, \`go\` auto-generates it from tasks.md (check \`auto_generated_graph\` in response)
2. Check the response status:
   - \`ready\` — nodes are ready to execute; proceed to step 3
   - \`done\` — workflow is complete; report summary
   - \`blocked\` — no runnable nodes; report which nodes are blocked and why
   - \`waiting\` — nodes are in progress; wait or check back later
3. **Create a team** for this batch: \`TeamCreate\` with name \`exec-<change>-<batch>\`
4. For each ready node, create a task (\`TaskCreate\`) and spawn a teammate:
   - \`deterministic\`: teammate runs \`foreman node start\` → command → \`foreman node complete\`
   - \`llm\`: teammate runs \`foreman node start\` → \`foreman context assemble\` → execute → verify → \`foreman node complete\`
   - \`human\`: present output to user, await approval (no teammate needed)
5. Wait for all teammates to complete, then cleanup: \`SendMessage\` shutdown → \`TeamDelete\`
6. Run \`foreman go $ARGUMENTS --json\` again to get the next batch
7. Repeat until status is \`done\`
8. Report final summary: nodes completed, tests passing, files changed

**Important**: Always use TeamCreate/TeamDelete for every batch, even single-node batches. Never use bare \`Agent\` calls outside a team boundary.

### Auto-Archive
When the workflow completes successfully (all nodes terminal, change status = complete), \`foreman go\` automatically archives the change:
- Moves change artifacts to \`.foreman/changes/archive/<change>/\`
- Preserves graph, state, and all node artifacts (L0/L1/L2, verify.md, qa-report.md)
- Cleans up original directories (changes, graph, nodes)
`,

  '.claude/commands/foreman-plan.md': `---
description: Plan a new Foreman change from a natural language description
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent, TeamCreate, TeamDelete, TaskCreate, TaskUpdate, SendMessage
---

# Foreman: Plan a change

Plan a new change from description: $ARGUMENTS

## Steps

### 1. Create the change
\`\`\`bash
foreman plan "$ARGUMENTS" --json
\`\`\`
Read the output JSON — it contains \`change\`, \`mode\`, \`path\`, and \`description\`.

### 2. Assemble planning context

Before spawning any planner agent, pre-assemble a compact \`<planning-context>\` block:

1. **Spec headers** — Grep \`.foreman/specs/\` for \`### Requirement:\` lines. Include only the header lines, not full spec content. If no specs exist, note "No existing specs found."
2. **Environment snapshot** — Read \`.foreman/env/snapshot.md\` if it exists, or run \`foreman snapshot\` to generate it.
3. **Relevant source paths** — Based on the description, identify key source files that will likely be affected.

Bundle into a \`<planning-context>\` block:
\`\`\`
<planning-context>
## Existing Specs
- spec-enforcement.md: ### Requirement: Mandatory Spec Generation
- spec-enforcement.md: ### Requirement: Spec-Fed Test Writing
(... one line per requirement header)

## Environment Snapshot
(snapshot.md content — file tree, deps, exports)

## Relevant Source Paths
- src/core/graph-generator.ts
- src/cli/go.ts
(... paths likely affected by this change)
</planning-context>
\`\`\`

Keep the context block compact — under ~500 tokens. Headers only, not full spec content.

### 3. Branch based on mode

**If \`mode: "brainstorm"\` (default):**

1. Create a team: \`TeamCreate\` with name \`plan-<change>\`
2. Create research task: \`TaskCreate\` for research phase
3. Spawn \`foreman-planner\` teammate with \`phase: "research"\`:
   - Pass the description, change path, AND the \`<planning-context>\` block
   - Agent uses the pre-assembled context, fills gaps, returns findings + 3-5 clarifying questions
4. Present the questions to the user with the agent's findings
5. Collect user answers
6. Create generate task: \`TaskCreate\` for generate phase
7. Spawn \`foreman-planner\` teammate with \`phase: "generate"\`:
   - Pass the description, answers, change path, AND the \`<planning-context>\` block
   - Agent writes proposal.md, design.md, tasks.md, and specs/
   - Returns a summary of what was generated
8. Cleanup: \`SendMessage\` shutdown to teammates → \`TeamDelete\`

**If \`mode: "yolo"\` (--yolo flag):**

1. Create a team: \`TeamCreate\` with name \`plan-<change>\`
2. Create YOLO task: \`TaskCreate\` for YOLO phase
3. Spawn \`foreman-planner\` teammate with \`phase: "yolo"\`:
   - Pass the description, change path, AND the \`<planning-context>\` block
   - Agent uses pre-assembled context, makes all decisions, writes all artifacts
   - Returns a summary
4. Cleanup: \`SendMessage\` shutdown → \`TeamDelete\`

### 4. Generate graph and present plan
\`\`\`bash
foreman graph generate <change-name>
foreman graph show <change-name>
\`\`\`
Show the generated graph to the user. Ask for approval before proceeding to \`foreman go\`.
`,

  '.claude/commands/foreman-status.md': `---
description: Show current status of a Foreman workflow
allowed-tools: Bash
---

# Foreman: Status

Show the status of workflow: $ARGUMENTS

Run \`foreman status $ARGUMENTS\` and display the output.
`,

  '.claude/hooks/node-complete.sh': `#!/bin/bash
# SubagentStop hook — generate preliminary L2 context after node completion
# NOTE: This generates L2 from git diff + verify.md. The foreman-summarizer agent
# may later overwrite L2.md with a richer version that includes subagent output.
# The summarizer's version takes precedence — this hook provides a baseline.

INPUT=$(cat)
AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // empty')

if [[ "$AGENT_ID" == foreman-* ]]; then
  CURRENT_NODE_FILE=".foreman/.current-node"
  if [ -f "$CURRENT_NODE_FILE" ]; then
    NODE_INFO=$(cat "$CURRENT_NODE_FILE")
    CHANGE=$(echo "$NODE_INFO" | cut -d'/' -f1)
    NODE=$(echo "$NODE_INFO" | cut -d'/' -f2)

    NODE_DIR=".foreman/nodes/\${CHANGE}/\${NODE}"
    mkdir -p "$NODE_DIR"

    git diff HEAD~1 2>/dev/null | grep -v '^---' > "\${NODE_DIR}/L2.md"
    if [ -f "\${NODE_DIR}/verify.md" ]; then
      echo "---" >> "\${NODE_DIR}/L2.md"
      cat "\${NODE_DIR}/verify.md" >> "\${NODE_DIR}/L2.md"
    fi

    echo "Node \${NODE} artifacts saved. L0/L1 generation pending." >&2
  fi
fi

exit 0
`,

  '.claude/hooks/scope-guard.sh': `#!/bin/bash
# PreToolUse hook for Write|Edit
# Reads JSON from stdin with tool_input.file_path
# Exit 2 = block the operation

INPUT=$(cat)

# Parse file path — prefer jq, fall back to grep/sed
if command -v jq &>/dev/null; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')
else
  FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"\\s*:\\s*"[^"]*"' | head -1 | sed 's/.*"file_path"\\s*:\\s*"//;s/"$//')
  [ -z "$FILE_PATH" ] && FILE_PATH=$(echo "$INPUT" | grep -o '"path"\\s*:\\s*"[^"]*"' | head -1 | sed 's/.*"path"\\s*:\\s*"//;s/"$//')
fi

SCOPE_FILE=".foreman/.current-scope"
if [ -f "$SCOPE_FILE" ] && [ -n "$FILE_PATH" ]; then
  ALLOWED=false
  while IFS= read -r pattern; do
    if [[ "$FILE_PATH" == $pattern* ]]; then
      ALLOWED=true
      break
    fi
  done < "$SCOPE_FILE"

  if [ "$ALLOWED" = false ]; then
    echo "BLOCKED: $FILE_PATH is outside scope. Allowed: $(cat $SCOPE_FILE)" >&2
    exit 2
  fi
fi

exit 0
`,

  '.claude/hooks/session-init.sh': `#!/bin/bash
# SessionStart hook — detect active Foreman workflow

if [ -d ".foreman" ]; then
  ACTIVE=$(find .foreman/graph -name "state.yaml" -exec grep -l "status: active" {} \\; 2>/dev/null | head -1)

  if [ -n "$ACTIVE" ]; then
    CHANGE_DIR=$(dirname "$ACTIVE")
    CHANGE=$(basename "$CHANGE_DIR")
    echo "{\\"additionalContext\\": \\"Foreman workflow active: \${CHANGE}. Run /project:foreman-status \${CHANGE} for details.\\"}" >&2
  fi
fi

exit 0
`,

  '.claude/hooks/type-check.sh': `#!/bin/bash
# PostToolUse hook for Write|Edit
# Runs tsc --noEmit after editing TypeScript files

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')

if [[ "$FILE_PATH" == *.ts ]] || [[ "$FILE_PATH" == *.tsx ]]; then
  RESULT=$(npx tsc --noEmit 2>&1)
  if [ $? -ne 0 ]; then
    echo "TYPE ERROR after editing $FILE_PATH:" >&2
    echo "$RESULT" >&2
  fi
fi

exit 0
`,
};

// Settings.json as a structured object (written as JSON, not markdown)
export const CLAUDE_SETTINGS = {
  hooks: {
    SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: '.claude/hooks/session-init.sh' }] }],
    PreToolUse: [{ matcher: 'Write|Edit', hooks: [{ type: 'command', command: '.claude/hooks/scope-guard.sh' }] }],
    PostToolUse: [{ matcher: 'Write|Edit', hooks: [{ type: 'command', command: '.claude/hooks/type-check.sh' }] }],
    SubagentStop: [{ matcher: '', hooks: [{ type: 'command', command: '.claude/hooks/node-complete.sh' }] }],
  },
  env: {
    CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
  },
};

// Schema.yaml content
export const SCHEMA_YAML: string = `name: spec-driven
version: 1
description: Default Foreman workflow - proposal → specs → design → tasks → graph

artifacts:
  - id: proposal
    generates: proposal.md
    description: Initial proposal document outlining the change
    template: proposal.md
    instruction: |
      Create the proposal document that establishes WHY this change is needed.

      Sections:
      - **Why**: 1-2 sentences on the problem or opportunity.
      - **What Changes**: Bullet list. Mark breaking changes with **BREAKING**.
      - **Capabilities**: Identify which specs will be created or modified:
        - **New Capabilities**: List capabilities being introduced. Each becomes \`.foreman/specs/<name>/spec.md\`. Use kebab-case.
        - **Modified Capabilities**: List existing capabilities whose REQUIREMENTS are changing. Each needs a delta spec file.
      - **Impact**: Affected files, directories, systems.

      Keep it concise (1-2 pages). Focus on "why" not "how".
    requires: []

  - id: specs
    generates: "specs/**/*.md"
    description: Delta specifications for the change
    template: spec.md
    instruction: |
      Create specification files defining WHAT the system should do.

      Create one spec file per capability in the proposal's Capabilities section:
      - New capabilities: \`.foreman/changes/<change>/specs/<capability>/spec.md\`
      - Modified capabilities: match existing folder name in \`.foreman/specs/<capability>/\`

      Delta operations:
      - **ADDED Requirements**: New capabilities
      - **MODIFIED Requirements**: Changed behavior — MUST include full updated content
      - **REMOVED Requirements**: Deprecated — MUST include **Reason** and **Migration**
      - **RENAMED Requirements**: Name changes — use FROM:/TO: format

      Format rules:
      - Requirements: \`### Requirement: <name>\` (3 hashtags)
      - Scenarios: \`#### Scenario: <name>\` (4 hashtags — CRITICAL, never 3)
      - Use SHALL/MUST for normative requirements
      - Every requirement needs at least one testable scenario
    requires:
      - proposal

  - id: design
    generates: design.md
    description: Technical design document
    template: design.md
    instruction: |
      Create the design document explaining HOW to implement the change.

      Only create if:
      - Cross-cutting change (multiple modules/services)
      - New external dependency or significant data model change
      - Security, performance, or migration complexity
      - Ambiguity that benefits from technical decisions before coding

      Sections: Context / Goals / Non-Goals / Decisions / Risks / Migration Plan / Open Questions
    requires:
      - proposal

  - id: tasks
    generates: tasks.md
    description: Implementation checklist
    template: tasks.md
    instruction: |
      Create the task list breaking down implementation work.

      - Group with \`## N.\` numbered headings
      - Every task: \`- [ ] N.M Task description\`
      - Order by dependency (blockers first)
      - Each task completable in one session

      These tasks become nodes in the Foreman execution graph.
    requires:
      - specs
      - design

apply:
  requires: [tasks]
  tracks: tasks.md
  instruction: |
    Run /project:foreman-graph <change> to generate the execution graph.
    Then run /project:foreman-run <change> to execute it.
`;

// Example graph content
export const EXAMPLE_GRAPH: string = `# Example Foreman graph: add-auth feature
# This graph implements JWT authentication for an API service.
# Generated by: /project:foreman-graph add-auth
# Run with: /project:foreman-run add-auth

change: add-auth
description: Add JWT-based authentication to the API

nodes:
  # ── Stage 0: Environment Snapshot ────────────────────────────────────────
  - id: snapshot
    type: deterministic
    description: Generate environment snapshot (file tree, deps, conventions)
    command: |
      echo "=== File Tree ===" > .foreman/nodes/add-auth/snapshot/output.txt
      find src -name "*.ts" | head -100 >> .foreman/nodes/add-auth/snapshot/output.txt
      echo "" >> .foreman/nodes/add-auth/snapshot/output.txt
      echo "=== Dependencies ===" >> .foreman/nodes/add-auth/snapshot/output.txt
      cat package.json >> .foreman/nodes/add-auth/snapshot/output.txt 2>/dev/null || echo "no package.json"
      echo "" >> .foreman/nodes/add-auth/snapshot/output.txt
      echo "=== Existing Interfaces ===" >> .foreman/nodes/add-auth/snapshot/output.txt
      grep -r "^export interface\\|^export type\\|^export function\\|^export class" src/ >> .foreman/nodes/add-auth/snapshot/output.txt 2>/dev/null
    deps: []
    outputs:
      - .foreman/nodes/add-auth/snapshot/output.txt

  # ── Stage 1: Write Tests (RED state) ─────────────────────────────────────
  - id: write-tests
    type: llm
    description: Write all tests before any implementation exists (RED state)
    agent: foreman-test-writer
    deps:
      - snapshot
    inputs:
      - .foreman/changes/add-auth/proposal.md
      - .foreman/changes/add-auth/design.md
    outputs:
      - src/__tests__/auth.unit.test.ts
      - src/__tests__/auth.integration.test.ts
      - src/__tests__/auth.acceptance.test.ts
    scope:
      - src/__tests__/
    validate:
      - tests-fail: src/__tests__/auth.unit.test.ts
      - tests-fail: src/__tests__/auth.integration.test.ts
      - file-exists: src/__tests__/auth.unit.test.ts
      - file-exists: src/__tests__/auth.integration.test.ts
    gate: human
    prompt: |
      Write comprehensive tests for the JWT authentication feature.
      Tests MUST all fail — no implementation exists yet.
      Cover: token generation, token validation, login endpoint, logout endpoint,
      protected route middleware, invalid credentials, expired tokens.

  # ── Stage 2: Implement Types ──────────────────────────────────────────────
  - id: impl-types
    type: llm
    description: Define TypeScript interfaces and types for auth system
    agent: foreman-implementer
    deps:
      - write-tests
    inputs: []
    outputs:
      - src/auth/types.ts
    scope:
      - src/auth/types.ts
    validate:
      - file-exists: src/auth/types.ts
      - tsc-check: ""
    prompt: |
      Define all TypeScript interfaces and types needed for the auth system.
      Look at the test files to understand the expected signatures.
      Create only src/auth/types.ts — no implementation logic.
      Required exports: JwtPayload, AuthConfig, LoginRequest, LoginResponse, AuthMiddleware type.

  # ── Stage 3: Implement JWT Utilities ─────────────────────────────────────
  - id: impl-jwt
    type: llm
    description: Implement JWT token generation and validation utilities
    agent: foreman-implementer
    deps:
      - impl-types
    inputs: []
    outputs:
      - src/auth/jwt.ts
    scope:
      - src/auth/jwt.ts
    validate:
      - tsc-check: ""
      - tests-pass: src/__tests__/auth.unit.test.ts
    prompt: |
      Implement JWT utility functions: generateToken(payload, secret, expiresIn),
      verifyToken(token, secret) → JwtPayload | null.
      Use only dependencies listed in the environment snapshot.
      Make the unit tests pass.

  # ── Stage 4: Implement Service Layer ─────────────────────────────────────
  - id: impl-service
    type: llm
    description: Implement AuthService with login/logout business logic
    agent: foreman-implementer
    deps:
      - impl-jwt
    inputs: []
    outputs:
      - src/auth/service.ts
    scope:
      - src/auth/service.ts
    validate:
      - tsc-check: ""
    prompt: |
      Implement AuthService class with: login(req: LoginRequest) → LoginResponse,
      logout(token: string) → void, validateSession(token: string) → JwtPayload | null.
      Use the jwt utilities from impl-jwt. Follow interfaces from impl-types.

  # ── Stage 5: Implement HTTP Handler ──────────────────────────────────────
  - id: impl-handler
    type: llm
    description: Implement HTTP route handlers and auth middleware
    agent: foreman-implementer
    deps:
      - impl-service
    inputs: []
    outputs:
      - src/auth/handler.ts
      - src/auth/middleware.ts
    scope:
      - src/auth/handler.ts
      - src/auth/middleware.ts
    validate:
      - tsc-check: ""
      - tests-pass: src/__tests__/auth.integration.test.ts
    prompt: |
      Implement: POST /auth/login handler, POST /auth/logout handler,
      authMiddleware for protecting routes.
      Wire up AuthService. Make integration tests pass.

  # ── Stage 6: Acceptance Tests ─────────────────────────────────────────────
  - id: acceptance
    type: llm
    description: Verify acceptance tests pass end-to-end
    agent: foreman-verifier
    deps:
      - impl-handler
    inputs: []
    outputs: []
    scope: []
    validate:
      - tests-pass: src/__tests__/auth.acceptance.test.ts
    prompt: |
      Run acceptance tests and verify they all pass.
      Report any failures with root cause analysis.

  # ── Stage 7: Full Integration ─────────────────────────────────────────────
  - id: integration
    type: deterministic
    description: Run full test suite to confirm nothing is broken
    command: |
      npm test 2>&1 | tee .foreman/nodes/add-auth/integration/output.txt
      exit \${PIPESTATUS[0]}
    deps:
      - acceptance
    outputs:
      - .foreman/nodes/add-auth/integration/output.txt
    validate:
      - exit-code: 0
`;

// .foreman/.gitignore content
export const FOREMAN_GITIGNORE = `.current-scope
.current-node
*.lock
`;
