### Requirement: Mandatory TeamCreate for All Specwork Execution

All specwork workflow execution — including planning agent spawns and graph node execution — SHALL use TeamCreate. The use of a bare `Agent` tool call (subagent without a team) is not permitted anywhere in the specwork execution loop.

This requirement applies regardless of: the number of nodes ready, the `parallel_mode` config setting, or the complexity of the workflow. Even a single-node sequential workflow SHALL go through TeamCreate.

#### Scenario: Single-node workflow uses TeamCreate
Given a workflow with exactly one ready node
When the `specwork-go` command or `specwork-engine` skill executes that node
Then a team SHALL be created with TeamCreate before the node is executed
And the node execution SHALL happen via a teammate in that team
And TeamDelete SHALL be called when the node completes

#### Scenario: Multi-node parallel workflow uses TeamCreate
Given a workflow with 3 or more ready nodes
When the engine executes the ready batch
Then a single team SHALL be created with TeamCreate
And each ready node SHALL be assigned to a separate teammate
And all teammates SHALL complete before TeamDelete is called

#### Scenario: Sequential multi-batch workflow uses TeamCreate per batch
Given a workflow that produces multiple sequential batches of ready nodes
When the engine processes each batch
Then a new team SHALL be created with TeamCreate for each batch
And the previous team SHALL be cleaned up with TeamDelete before the next batch begins

#### Scenario: Engine skill does not use bare Agent tool calls
Given the specwork-engine skill executing any LLM node
When it needs to spawn a subagent (test-writer, implementer, verifier, summarizer)
Then the spawn SHALL happen within a TeamCreate/TeamDelete boundary
And a bare `Agent` tool call outside of a team SHALL NOT be used

### Requirement: Parallel Mode Defaults to Parallel

The default value for `config.execution.parallel_mode` SHALL be `parallel`, not `sequential`.

#### Scenario: New project config defaults to parallel
Given a project initialized with `specwork init`
When the generated `config.yaml` is inspected
Then `execution.parallel_mode` SHALL be `parallel`

#### Scenario: Existing config with sequential is respected
Given a project with `parallel_mode: sequential` explicitly set in config.yaml
When the engine runs
Then the engine SHALL respect the explicit `sequential` setting
And SHALL NOT override it with the default

#### Scenario: Parallel mode behavior unchanged
Given `parallel_mode: parallel` in config
When 3 or more nodes are ready simultaneously
Then the engine SHALL use a single TeamCreate with one teammate per node
And node execution SHALL proceed concurrently

#### Scenario: Parallel mode with fewer than 3 ready nodes
Given `parallel_mode: parallel` in config
When 1 or 2 nodes are ready
Then the engine SHALL still use TeamCreate
And the teammate(s) SHALL execute those nodes within the team boundary

### Requirement: TeamCreate Lifecycle Compliance

Every TeamCreate call in the specwork loop SHALL be paired with a TeamDelete call. Teams SHALL NOT be left open after a workflow batch completes.

#### Scenario: Team is deleted after successful batch
Given a team created to execute a batch of nodes
When all nodes in the batch complete successfully
Then TeamDelete SHALL be called for that team

#### Scenario: Team is deleted after failed batch
Given a team created to execute a batch of nodes
When one or more nodes fail or are escalated
Then TeamDelete SHALL still be called before the engine reports the failure to the caller
