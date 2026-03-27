### Requirement: Task Check-Off on Node Complete

When a node with ID matching `impl-{N}-{M}` transitions to `complete`, the CLI MUST automatically update the corresponding checkbox in the change's `tasks.md` from `- [ ]` to `- [x]`. The mapping SHALL be: N = the Nth `## ` section header encountered (1-based), M = the Mth checkbox line within that section (1-based). Non-impl nodes (snapshot, write-tests, integration) SHALL NOT attempt to match tasks.md.

If `tasks.md` does not exist, the operation MUST silently no-op (no error).

#### Scenario: impl node complete checks off matching task
Given a `tasks.md` with group 2 containing `- [ ] Some task description` as its first checkbox
When `specwork node complete <change> impl-2-1` is called (after passing verification)
Then the first checkbox in group 2 is updated to `- [x] Some task description`
And all other lines in tasks.md are unchanged

#### Scenario: non-impl node complete does not touch tasks.md
Given a `tasks.md` exists in the change directory
When `specwork node complete <change> write-tests` is called
Then tasks.md is not modified

#### Scenario: missing tasks.md is silently ignored
Given no `tasks.md` exists in the change directory
When `specwork node complete <change> impl-1-1` is called
Then the command exits with code 0
And no error is emitted

---

### Requirement: Task Uncheck on Node Fail or Escalate

When a node with ID matching `impl-{N}-{M}` transitions to `failed` or `escalated`, the CLI MUST revert the corresponding checkbox in `tasks.md` from `- [x]` back to `- [ ]`. The same group/task index mapping applies as for check-off. This ensures tasks.md reflects the current workflow state accurately when nodes are retried or escalated.

If the task line is already `- [ ]` (never checked, or already unchecked), the operation MUST silently no-op.

#### Scenario: impl node fail unchecks previously checked task
Given a `tasks.md` with group 1, task 2 showing `- [x] Previously completed task`
When `specwork node fail <change> impl-1-2` is called
Then that line is reverted to `- [ ] Previously completed task`

#### Scenario: impl node escalate unchecks task
Given a `tasks.md` with group 3, task 1 showing `- [x] Some task`
When `specwork node escalate <change> impl-3-1` is called
Then that line is reverted to `- [ ] Some task`

#### Scenario: unchecking an already-unchecked task is a no-op
Given a `tasks.md` where the target task is already `- [ ]`
When `specwork node fail <change> impl-1-1` is called
Then the line is unchanged
And the command exits with code 0

#### Scenario: non-impl node fail does not touch tasks.md
Given a `tasks.md` exists
When `specwork node fail <change> write-tests` is called
Then tasks.md is not modified

---

### Requirement: tasks.md Convention for write-tests and integration Nodes

The `tasks.md` format SHALL support optional convention lines for non-impl nodes using prefixed IDs so the workflow completion is visible in tasks.md. Specifically:

- A line with prefix `write-tests:` (e.g., `- [ ] write-tests: Write tests from specs`) SHALL be checked off when the `write-tests` node completes
- A line with prefix `integration:` (e.g., `- [ ] integration: Run integration verification`) SHALL be checked off when the `integration` node completes

The graph-generator SHALL detect these convention lines when present in `tasks.md` and create no additional impl nodes for them (they are metadata, not impl tasks).

These lines are OPTIONAL. Absence of convention lines in tasks.md MUST NOT cause errors.

#### Scenario: write-tests convention line is checked on node complete
Given a `tasks.md` containing `- [ ] write-tests: Write tests from specs`
When `specwork node complete <change> write-tests` is called
Then that line becomes `- [x] write-tests: Write tests from specs`

#### Scenario: integration convention line is checked on node complete
Given a `tasks.md` containing `- [ ] integration: Run integration verification`
When `specwork node complete <change> integration` is called
Then that line becomes `- [x] integration: Run integration verification`

#### Scenario: convention lines are not parsed as impl tasks by graph-generator
Given a `tasks.md` with convention lines `- [ ] write-tests: ...` and `- [ ] integration: ...`
When `specwork graph generate <change>` is called
Then no `impl-N-M` nodes are created for those lines
And the write-tests and integration graph nodes remain of their standard types

---

### Requirement: Idempotency of Checkbox Operations

Completing a node twice MUST NOT double-check a line (the regex only matches `- [ ]`, so a `- [x]` line is skipped). Failing a node twice MUST NOT corrupt the line (the regex only matches `- [x]`, so a `- [ ]` line is skipped). These properties emerge from the regex match guards and MUST be preserved.

#### Scenario: re-completing a node does not corrupt tasks.md
Given a `tasks.md` where impl-2-1's line is already `- [x]`
When `specwork node complete <change> impl-2-1` is called again
Then the line remains `- [x]` (unchanged)

#### Scenario: re-failing a node that was never checked is a no-op
Given a `tasks.md` where impl-1-1's line is `- [ ]`
When `specwork node fail <change> impl-1-1` is called
Then the line remains `- [ ]` (unchanged)
