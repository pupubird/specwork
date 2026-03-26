---
description: Generate a Foreman graph from change tasks
allowed-tools: Bash
---

# Foreman: Generate graph

Generate a workflow graph for change: $ARGUMENTS

## Steps

1. Run `foreman graph generate $ARGUMENTS` — reads tasks.md, design.md, proposal.md and generates graph.yaml + state.yaml
2. Run `foreman graph validate $ARGUMENTS` — checks for cycles, missing deps, and schema errors
3. Run `foreman graph show $ARGUMENTS` — displays the graph as a table
4. Show results to user for review before execution
