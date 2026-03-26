### Requirement: Pre-Assembled Planning Context

Before spawning the planner agent, the `foreman-plan` command SHALL assemble a compact codebase context block and pass it as input to the agent. The context SHALL include: (a) a listing of files in `.foreman/specs/` with their requirement headers only, (b) the current environment snapshot (file tree + dependencies), and (c) relevant source file paths.

The context SHALL be compact — requirement headers extracted from spec files, not full spec content.

#### Scenario: Planner receives pre-assembled context in brainstorm mode
Given a change created via `foreman plan "<description>"`
When the `foreman-plan` command prepares to spawn the planner in research phase
Then the command SHALL read `.foreman/specs/` and extract only `### Requirement:` header lines from each spec file
And the command SHALL include the environment snapshot output
And both SHALL be bundled into a `<planning-context>` block passed to the planner agent
And the planner agent SHALL NOT need to re-read `.foreman/specs/` on its own

#### Scenario: Planner receives pre-assembled context in YOLO mode
Given a change created via `foreman plan "<description>" --yolo`
When the `foreman-plan` command prepares to spawn the planner in YOLO phase
Then the pre-assembled context block SHALL be passed to the planner agent identically to brainstorm mode

#### Scenario: Planning context is compact, not exhaustive
Given a project with multiple spec files in `.foreman/specs/`
When the planning context is assembled
Then only requirement header lines (lines matching `### Requirement:`) SHALL be extracted from spec files
And full spec content (scenarios, descriptions, examples) SHALL NOT be included in the planning context
And the total planning context block SHOULD be under 500 tokens

#### Scenario: Empty specs folder handled gracefully
Given a project with no files in `.foreman/specs/`
When the planning context is assembled
Then the context block SHALL still be assembled with the file tree and snapshot
And the specs section SHALL indicate no existing specs found
And the planner SHALL be spawned normally

### Requirement: Planner Skips Redundant Spec Reads

When a planner agent receives a pre-assembled `<planning-context>` block, it SHALL use that block as the authoritative source for existing specs and file structure. It SHALL NOT re-read `.foreman/specs/` unless it needs detail beyond what the headers provide.

#### Scenario: Planner uses provided context in research phase
Given a planner agent spawned with a `<planning-context>` block
When the agent performs its research phase
Then the agent SHALL use the spec headers from the provided context to understand existing capabilities
And the agent SHALL NOT make additional reads of `.foreman/specs/` files for the purpose of listing capabilities

#### Scenario: Planner may expand a specific spec when needed
Given a planner agent that needs detail from one specific existing spec
When the agent determines it needs the full content of that spec (not just the header)
Then the agent MAY read that specific spec file directly
And this SHALL be treated as an intentional deep-read, not redundant scanning

### Requirement: TeamCreate for Planning Agent Spawn

The `foreman-plan` slash command SHALL use TeamCreate to manage the planner agent lifecycle, regardless of whether the flow is brainstorm or YOLO mode.

#### Scenario: Brainstorm planning uses a team
Given a change in brainstorm mode
When `foreman-plan` spawns the planner for the research phase
Then a team SHALL be created with TeamCreate before the agent is spawned
And the planner agent SHALL be spawned as a teammate within that team
And the team SHALL be cleaned up with TeamDelete after the planner completes

#### Scenario: YOLO planning uses a team
Given a change in YOLO mode
When `foreman-plan` spawns the planner for the YOLO phase
Then a team SHALL be created with TeamCreate
And cleaned up with TeamDelete after the planner completes
