# Summary: specwork-doctor

**Archived:** 2026-03-26 | **Nodes:** 7 | **Status:** complete

## Summary

Add `specwork doctor` command that validates all Specwork artifacts in one pass: config correctness, spec formatting (3# requirements, 4# scenarios, SHALL/SHOULD keywords), archive integrity (status: archived, required files, no loose runtime artifacts), in-flight change structure, graph validity (reusing graph-validator.ts), template presence, and cross-references. Reports pass/fail per check with ✓/✗ symbols and summary counts. Supports `--fix` for safe auto-repairs and `--category` to limit scope.

## Node Timeline

- **snapshot**: Environment snapshot captured
- **write-tests**: Unit and integration tests written for all checkers and runDoctor orchestrator
- **impl-types**: DiagnosticResult, CheckResult, DoctorReport, DoctorOptions types defined in src/core/doctor.ts
- **impl-checkers**: checkConfig, checkSpecs, checkArchives, checkChanges, checkGraphs, checkTemplates, checkCrossRefs implemented
- **impl-orchestrator**: runDoctor(), applyFixes(), formatReport() orchestrator implemented
- **impl-cli**: makeDoctorCommand() implemented in src/cli/doctor.ts; registered in src/index.ts
- **integration**: All tests pass

## Verification Summary

| Node | Verdict |
|------|---------|
| snapshot | PASS |
| write-tests | PASS |
| impl-types | PASS |
| impl-checkers | PASS |
| impl-orchestrator | PASS |
| impl-cli | PASS |
| integration | PASS |
