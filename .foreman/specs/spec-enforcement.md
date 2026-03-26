### Requirement: Mandatory Spec Generation

The planner agent SHALL generate at least one spec file per change during artifact generation (Phase 2, YOLO).

#### Scenario: Planner generates specs in brainstorm mode
Given a change created via `foreman plan`
When the planner agent runs Phase 2 (generate)
Then at least one `.md` file SHALL exist in `<change>/specs/`

#### Scenario: Planner generates specs in yolo mode
Given a change created via `foreman plan --yolo`
When the planner agent runs the YOLO phase
Then at least one `.md` file SHALL exist in `<change>/specs/`

### Requirement: Spec-Fed Test Writing

The graph generator SHALL pass spec files as inputs to the write-tests node.

#### Scenario: Graph includes spec inputs for write-tests
Given a change with specs in `<change>/specs/`
When `foreman graph generate` runs
Then the `write-tests` node's `inputs` array SHALL include paths to all spec files

#### Scenario: Graph works without specs (graceful degradation)
Given a change with no spec files in `<change>/specs/`
When `foreman graph generate` runs
Then the graph SHALL be generated successfully
And a warning SHOULD be logged about missing specs
