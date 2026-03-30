### Requirement: ChangeStatus Type Includes Final-Review Value

The `ChangeStatus` type SHALL include a `'final-review'` value representing a change that has completed all implementation nodes and is undergoing holistic QA review before transitioning to done.

#### Scenario: final-review is a valid ChangeStatus value
Given the `ChangeStatus` type definition
When the type is inspected
Then `'final-review'` SHALL be a valid value in the union
And all exhaustive switches on `ChangeStatus` MUST handle the `'final-review'` case

#### Scenario: final-review is distinct from in-progress and done
Given a change in `final-review` status
When `getChangeStatus` is called
Then it SHALL return `'final-review'` (not `'in-progress'` and not `'done'`)

---

### Requirement: go:final-review is a Valid Engine Action

The `next-action` system SHALL recognize `go:final-review` as a valid action. When all nodes in a change are complete and a final review has not yet been run, the engine MUST return `go:final-review` as the next action instead of `go:done`.

#### Scenario: Engine returns go:final-review when all nodes done and review not yet run
Given all nodes in a change have status `done`
And no final-review result exists for the change
When `getNextAction` is called
Then it SHALL return action `go:final-review`
And it SHALL NOT return `go:done`

#### Scenario: Engine returns go:done after final review PASS
Given all nodes in a change have status `done`
And a final-review result exists with status PASS
When `getNextAction` is called
Then it SHALL return action `go:done`

#### Scenario: Engine returns go:blocked after final review FAIL
Given all nodes in a change have status `done`
And a final-review result exists with status FAIL
When `getNextAction` is called
Then it SHALL return action `go:blocked`
And the blocked reason SHALL reference the final-review output path

---

### Requirement: State Machine Handles go:final-review Transitions

The state machine SHALL define valid transitions into and out of the `final-review` state. Transitions MUST be deterministic based on the final review QA result.

#### Scenario: Transition from all-nodes-done to final-review
Given a change where the last node transitions to `done`
When the state machine evaluates the next transition
Then the change state SHALL transition to `final-review`

#### Scenario: Transition from final-review to done on PASS
Given a change in `final-review` state
When specwork-qa returns PASS
Then the change state SHALL transition to `done`
And auto-archive SHALL be triggered

#### Scenario: Transition from final-review to blocked on FAIL
Given a change in `final-review` state
When specwork-qa returns FAIL
Then the change state SHALL transition to `blocked`
And the engine SHALL NOT retry automatically
And the final-review output SHALL be persisted and accessible to the user

---

### Requirement: go:final-review State is Documented in Engine Skill

The `specwork-engine` SKILL.md and `specwork-go.md` command documentation SHALL include `go:final-review` in all state machine tables and transition diagrams.

#### Scenario: State machine table in SKILL.md includes go:final-review
Given the specwork-engine SKILL.md file
When the state machine table is read
Then `go:final-review` SHALL appear as a state
And its entry condition (all nodes done, no review yet) SHALL be documented
And its exit transitions (PASS → go:done, FAIL → go:blocked) SHALL be documented

#### Scenario: specwork-go.md documents the final-review step
Given the specwork-go.md command file
When the node execution protocol section is read
Then the final-review step SHALL be described as automatic
And it SHALL be clear that it fires after the last node's summarizer completes
And the user SHALL understand that FAIL requires manual triage
