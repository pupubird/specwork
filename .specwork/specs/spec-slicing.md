### Requirement: Spec Slicing via GraphNode.specs Field

`GraphNode` SHALL support an optional `specs: string[]` field. Each entry is a reference in the format `"<filename>#<ScenarioName>"` pointing to a spec file in `.specwork/changes/<change>/specs/` or `.specwork/specs/` and a named scenario within it.

The assembler SHALL resolve each reference by reading the named spec file and extracting only the `#### Scenario: <ScenarioName>` block (including its Given/When/Then lines). If no anchor is present (just `"<filename>"`), the full file content is included.

Unresolved references (file not found, scenario not found) MUST produce a warning comment in the micro-spec but MUST NOT throw an error or abort composition.

#### Scenario: Single scenario extracted from spec file
Given a node with `specs: ["verification.md#Scope check passes for in-scope files"]`
When the micro-spec is composed
Then the `## Spec Scenarios` section contains only the `#### Scenario: Scope check passes for in-scope files` block
And other scenarios from `verification.md` are excluded

#### Scenario: Full spec file included when no anchor given
Given a node with `specs: ["context-injection.md"]` (no `#` anchor)
When the micro-spec is composed
Then the `## Spec Scenarios` section contains the full content of `context-injection.md`

#### Scenario: Multiple spec references are concatenated
Given a node with `specs: ["auth.md#Login success", "auth.md#Login failure"]`
When the micro-spec is composed
Then the `## Spec Scenarios` section contains both scenario blocks in order

#### Scenario: Missing spec file produces a warning comment, not an error
Given a node with `specs: ["nonexistent.md#SomeScenario"]`
When the micro-spec is composed
Then the `## Spec Scenarios` section contains a comment `<!-- spec not found: nonexistent.md -->`
And no exception is thrown

#### Scenario: Missing scenario anchor produces a warning comment, not an error
Given a node with `specs: ["verification.md#NoSuchScenario"]`
When the micro-spec is composed
Then the `## Spec Scenarios` section contains a comment `<!-- scenario not found: NoSuchScenario in verification.md -->`

#### Scenario: Nodes without specs field have no Spec Scenarios section
Given a `GraphNode` with no `specs` field
When the micro-spec is composed
Then the output does not contain a `## Spec Scenarios` section header
