# Archive: improve-go-cli-command-with-next-action-suggestions-for-each-nodegraph-state

## Graph

Nodes: 24 | Created: 2026-03-26T19:38:56.219Z

| ID | Type | Deps |
|----|------|------|
| snapshot | deterministic | - |
| write-tests | llm | snapshot |
| impl-1-1 | llm | write-tests |
| impl-1-2 | llm | impl-1-1 |
| impl-1-3 | llm | impl-1-2 |
| impl-1-4 | llm | impl-1-3 |
| impl-2-1 | llm | write-tests |
| impl-2-2 | llm | impl-2-1 |
| impl-2-3 | llm | impl-2-2 |
| impl-2-4 | llm | impl-2-3 |
| impl-2-5 | llm | impl-2-4 |
| impl-3-1 | llm | write-tests |
| impl-3-2 | llm | impl-3-1 |
| impl-3-3 | llm | impl-3-2 |
| impl-3-4 | llm | impl-3-3 |
| impl-3-5 | llm | impl-3-4 |
| impl-3-6 | llm | impl-3-5 |
| impl-4-1 | llm | write-tests |
| impl-4-2 | llm | impl-4-1 |
| impl-5-1 | llm | write-tests |
| impl-5-2 | llm | impl-5-1 |
| impl-5-3 | llm | impl-5-2 |
| impl-5-4 | llm | impl-5-3 |
| integration | deterministic | impl-1-4, impl-2-5, impl-3-6, impl-4-2, impl-5-4 |

## State

Status: complete
Updated: 2026-03-26T20:02:46.003Z

- **snapshot**: complete
- **write-tests**: complete
- **impl-1-1**: complete
- **impl-1-2**: complete
- **impl-1-3**: complete
- **impl-1-4**: complete
- **impl-2-1**: complete
- **impl-2-2**: complete
- **impl-2-3**: complete
- **impl-2-4**: complete
- **impl-2-5**: complete
- **impl-3-1**: complete
- **impl-3-2**: complete
- **impl-3-3**: complete
- **impl-3-4**: complete
- **impl-3-5**: complete
- **impl-3-6**: complete
- **impl-4-1**: complete
- **impl-4-2**: complete
- **impl-5-1**: complete
- **impl-5-2**: complete
- **impl-5-3**: complete
- **impl-5-4**: complete
- **integration**: complete

## Nodes

### impl-1-1

- impl-1-1: NextAction interface added to state.ts

### impl-1-2

- impl-1-2: readChangeContext reads .specwork.yaml description

### impl-1-3

- impl-1-3: buildNextAction maps all 11 states to NextAction

### impl-1-4

- impl-1-4: NextAction auto-exported via types/index.ts barrel

### impl-2-1

- impl-2-1: next_action added to go.ts

### impl-2-2

- impl-2-2: next_action added to go.ts

### impl-2-3

- impl-2-3: next_action added to go.ts

### impl-2-4

- impl-2-4: next_action added to go.ts

### impl-2-5

- impl-2-5: next_action added to go.ts

### impl-3-1

- impl-3-1: next_action added to node.ts

### impl-3-2

- impl-3-2: next_action added to node.ts

### impl-3-3

- impl-3-3: next_action added to node.ts

### impl-3-4

- impl-3-4: next_action added to node.ts

### impl-3-5

- impl-3-5: next_action added to node.ts

### impl-3-6

- impl-3-6: next_action added to node.ts

### impl-4-1

- impl-4-1: SKILL.md trimmed from 466 to 60 lines

### impl-4-2

- impl-4-2: specwork-go.md trimmed to 13 lines

### impl-5-1

- impl-5-1: tests passing

### impl-5-2

- impl-5-2: tests passing

### impl-5-3

- impl-5-3: tests passing

### impl-5-4

- impl-5-4: tests passing

### integration

- integration: 422 tests passing across 25 files

### snapshot

- snapshot: Environment snapshot captured

### write-tests

- write-tests: 22 tests written (13 unit, 9 integration) for next-action — all RED
