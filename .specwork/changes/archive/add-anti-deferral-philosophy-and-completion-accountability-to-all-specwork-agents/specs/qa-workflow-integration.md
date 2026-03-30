### Requirement: QA Agent Runs After Every Node Verify PASS

After a node's verify step returns PASS, the specwork-qa agent SHALL run automatically before the summarizer is invoked. This per-node QA check MUST be scoped to the current node's diff only. The workflow MUST NOT proceed to the summarizer until QA has passed.

#### Scenario: QA runs after verify PASS
Given a node that has just passed the verify step
When the engine processes the result
Then specwork-qa SHALL be spawned with the current node's diff as its scope
And specwork-qa SHALL check for: deferred work patterns, spec compliance for the node's declared scope, and regressions in files the node touched

#### Scenario: QA PASS allows summarizer to proceed
Given a node where specwork-qa returns PASS
When the QA result is processed
Then the engine SHALL proceed to invoke the summarizer
And the node lifecycle SHALL continue normally

#### Scenario: QA FAIL triggers node retry
Given a node where specwork-qa returns FAIL
When the QA result is processed
Then the engine SHALL treat this as a node failure
And the node SHALL be retried up to `max_retries` times (as configured)
And the QA failure report SHALL be included in the retry context so the agent can see what it missed

#### Scenario: QA scope is limited to current node's diff
Given a node that modified three files
When specwork-qa runs for that node
Then specwork-qa SHALL evaluate only the diff produced by that node
And it SHALL NOT evaluate diffs from other nodes in the change

---

### Requirement: Final Review Session Evaluates Complete Change

When all nodes in a change are complete, the engine SHALL run a final holistic QA review before transitioning to the done state. This final review MUST evaluate the entire change (all node diffs combined) against the full change spec set.

#### Scenario: Final review fires automatically after last node completes
Given a change where all nodes have completed and been summarized
When the engine determines the next action
Then the engine SHALL initiate a `go:final-review` action
And this SHALL happen automatically without requiring user input

#### Scenario: Final review receives full change context
Given the `go:final-review` state is active
When specwork-qa is spawned for final review
Then it SHALL receive: all diffs from all nodes in the change, the complete spec set from `.specwork/changes/<name>/specs/`, and L1 summaries of all completed nodes

#### Scenario: Final review PASS transitions to done
Given specwork-qa returns PASS for the final review
When the result is processed
Then the engine SHALL transition to `go:done`
And the auto-archive process SHALL proceed normally

#### Scenario: Final review FAIL blocks the change
Given specwork-qa returns FAIL for the final review
When the result is processed
Then the engine SHALL transition to `go:blocked`
And the final review report SHALL be surfaced to the user
And the engine SHALL NOT auto-archive the change
And the engine SHALL NOT auto-retry — final review failure requires human triage

#### Scenario: Final review output is persisted
Given a final review has completed (PASS or FAIL)
When the result is written
Then the output SHALL be saved to `.specwork/nodes/<change>/final-review/output.txt`
And it SHALL be accessible via `specwork status`
