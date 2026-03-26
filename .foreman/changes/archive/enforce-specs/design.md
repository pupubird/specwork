## Context

The schema.yaml already defines the correct flow: `proposal → specs → design → tasks`. But the planner agent and graph generator don't enforce it.

## Goals / Non-Goals

**Goals:**
- Planner agent always generates at least one spec file per change
- Graph generator passes spec files as inputs to write-tests node
- Test writer agent uses specs to derive test cases (not just improvise)

**Non-Goals:**
- Spec validation/linting (future improvement)
- Changing the spec format (already well-defined in schema.yaml)
- Breaking existing changes that have no specs (graceful degradation)

## Decisions

### Decision: Mandatory specs, but lightweight for internal changes
For internal refactors, a single spec with one requirement and scenario is enough. The point is to have a behavioral contract, not bureaucracy.

### Decision: Graph generator auto-discovers spec files
Rather than hardcoding spec paths, the graph generator reads `<change>/specs/` directory and adds all `.md` files as inputs to write-tests.

### Decision: Graceful when no specs exist
Graph generator still works if specs/ is empty — just logs a warning. This avoids breaking existing flows.
