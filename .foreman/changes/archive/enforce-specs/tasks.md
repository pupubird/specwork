## 1. Planner Agent

- [ ] 1.1 Update `.claude/agents/foreman-planner.md` — make spec generation mandatory in Phase 2 and YOLO, add spec format examples, require at least one spec file per change
- [ ] 1.2 Write specs for this change in `.foreman/changes/enforce-specs/specs/` to prove the flow works

## 2. Graph Generator

- [ ] 2.1 Update `src/core/graph-generator.ts` — auto-discover spec files from `<change>/specs/` and add as inputs to write-tests node, log warning if no specs found
- [ ] 2.2 Add tests for spec input discovery in `src/__tests__/core/graph-generator.test.ts`
