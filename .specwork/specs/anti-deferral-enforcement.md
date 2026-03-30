### Requirement: Agent Instructions Prohibit Deferred Work

All specwork agent instruction files SHALL contain explicit rules prohibiting deferred work. Agents MUST NOT produce TODOs, FIXMEs, stub implementations, placeholder logic, or any pattern that defers work to a later time. Each agent's prohibition SHALL be scoped to the type of output that agent produces.

#### Scenario: Implementer is prohibited from writing stub code
Given an implementer agent instruction file
When the agent is given a task to implement a function
Then the instructions SHALL prohibit writing `TODO`, `FIXME`, `stub`, `placeholder`, or `throw new Error('not implemented')` in implementation files
And the instructions SHALL direct the agent to STOP and report if it cannot complete the implementation fully

#### Scenario: Test writer is prohibited from writing stub tests
Given a test-writer agent instruction file
When the agent is given a task to write tests for a capability
Then the instructions SHALL prohibit writing tests with empty bodies, TODO comments, or no assertions
And the instructions SHALL require that every test have a real assertion that fails because the implementation does not yet exist

#### Scenario: Verifier checks for deferred work patterns
Given a verifier agent instruction file
When the verifier evaluates a node's diff
Then the instructions SHALL direct the agent to report FAIL if the diff contains TODO, FIXME, stub, placeholder, or `not implemented` patterns
And this check SHALL apply even if all structural verification checks pass

#### Scenario: Summarizer refuses to summarize incomplete nodes
Given a summarizer agent instruction file
When the summarizer is given a node with TODO or FIXME markers in its output
Then the instructions SHALL direct the agent to report incompleteness rather than generate a success summary

#### Scenario: Planner produces only completable tasks
Given a planner agent instruction file
When the planner writes tasks for a change
Then the instructions SHALL prohibit tasks that use language deferring work ("stub out X for now", "implement X later")
And each task SHALL be described as fully completable in one session

---

### Requirement: No-Todos Verification Check Blocks Deferred Work

The verification system SHALL include a built-in check named `no-todos` that automatically runs on every node verify. This check MUST scan the node's git diff for deferred work patterns and MUST fail verification if any are found.

#### Scenario: Check detects TODO in implementation file
Given a node whose diff includes a line containing `// TODO: implement this`
When the `no-todos` check runs
Then verification MUST fail
And the output MUST include the file name and line number of the TODO

#### Scenario: Check detects FIXME pattern
Given a node whose diff includes a line containing `// FIXME: broken`
When the `no-todos` check runs
Then verification MUST fail

#### Scenario: Check detects stub/placeholder patterns
Given a node whose diff includes any of: `STUB`, `PLACEHOLDER`, `NOT_IMPLEMENTED`, `throw new Error('not implemented')`
When the `no-todos` check runs
Then verification MUST fail

#### Scenario: Check passes on clean diff
Given a node whose diff contains no deferred work patterns
When the `no-todos` check runs
Then verification MUST pass

#### Scenario: Check ignores .specwork/ directory
Given a node whose diff includes a TODO inside a `.specwork/` file (e.g. a spec or proposal)
When the `no-todos` check runs
Then verification MUST pass for that file
And the TODO MUST NOT be reported as a failure

#### Scenario: Check runs automatically without configuration
Given a graph.yaml that does not mention the `no-todos` check
When a node's verify step runs
Then the `no-todos` check SHALL run automatically as a default check
And it SHALL run in addition to any node-specific checks defined in graph.yaml
