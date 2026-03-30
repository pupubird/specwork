# Plan Visualization

Behavioral spec for the `specwork viz` command and HTML renderer.

---

### Requirement: Self-Contained HTML Output

The renderer SHALL produce a single `overview.html` file at `.specwork/changes/<change>/overview.html` that contains all CSS and JS inline (no external files except CDN scripts).

#### Scenario: Generate overview.html

- **GIVEN** a change directory with `graph.yaml` and `proposal.md`
- **WHEN** the renderer runs
- **THEN** it SHALL write `overview.html` to the change directory
- **AND** the file SHALL be a valid HTML document openable in any modern browser

#### Scenario: Mermaid CDN for DAG rendering

- **GIVEN** the rendered HTML
- **THEN** it SHALL load Mermaid.js from a CDN `<script>` tag
- **AND** the DAG SHALL render as a top-down (TD) flowchart

---

### Requirement: DAG Graph Visualization

The HTML SHALL render all nodes from `graph.yaml` as a directed graph with edges from `deps`.

#### Scenario: Node type coloring

- **GIVEN** nodes of types `snapshot`, `write-tests`, `impl-*`, and `integration`
- **THEN** each type SHALL have a distinct visual color/style in the graph

#### Scenario: Group node badge

- **GIVEN** a node with `sub_tasks` array (group node)
- **THEN** the graph SHALL display a badge or indicator showing the number of sub-tasks

#### Scenario: Dependency edges

- **GIVEN** a node with `deps: [A, B]`
- **THEN** the graph SHALL draw directed edges from A and B to this node

---

### Requirement: Proposal Overview Panel

The HTML SHALL include a panel showing the change rationale extracted from `proposal.md`.

#### Scenario: WHY section extraction

- **GIVEN** a `proposal.md` with a `## Why` section
- **WHEN** the renderer extracts proposal content
- **THEN** the panel SHALL display the text under `## Why`

#### Scenario: Change metadata

- **GIVEN** a change with a name and description
- **THEN** the header SHALL display the change name and description

---

### Requirement: Spec Requirements Per Node

The HTML SHALL show spec requirements associated with each node.

#### Scenario: Node detail panel with specs

- **GIVEN** a node in the graph and spec files in `specs/`
- **WHEN** the user clicks or expands a node
- **THEN** the panel SHALL show the node's type, agent/command, scope, dependencies
- **AND** if specs are mapped to the node, it SHALL list the relevant `### Requirement:` headers

#### Scenario: Global specs summary

- **GIVEN** spec files in the change's `specs/` directory
- **THEN** the HTML SHALL include a specs summary section listing all requirements grouped by file

---

### Requirement: CLI Command specwork viz

The `specwork viz <change>` command SHALL open or generate the visualization.

#### Scenario: Open existing

- **GIVEN** `overview.html` exists in the change directory
- **WHEN** the user runs `specwork viz <change>` without flags
- **THEN** it SHALL open the existing file in the default browser
- **AND** it SHALL NOT regenerate

#### Scenario: Refresh flag

- **GIVEN** `overview.html` exists
- **WHEN** the user runs `specwork viz <change> --refresh`
- **THEN** it SHALL regenerate `overview.html` from current artifacts before opening

#### Scenario: Generate if missing

- **GIVEN** `overview.html` does NOT exist
- **WHEN** the user runs `specwork viz <change>`
- **THEN** it SHALL generate `overview.html` and then open it

#### Scenario: Change not found

- **GIVEN** no change directory exists for the given name
- **WHEN** the user runs `specwork viz <change>`
- **THEN** it SHALL exit with an error message

---

### Requirement: Plan Skill Integration

The specwork-plan skill SHALL auto-trigger visualization after graph generation.

#### Scenario: Auto-trigger in step 4

- **GIVEN** the plan skill completes graph generation (step 4)
- **WHEN** `specwork graph generate` and `specwork graph show` succeed
- **THEN** the skill SHALL call `specwork viz <change>` to generate and open the visualization
- **AND** this SHALL happen before presenting the graph to the user for approval
