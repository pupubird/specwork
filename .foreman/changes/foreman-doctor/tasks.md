## 1. Types & Interfaces

- [ ] 1.1 Define DiagnosticResult, CheckResult, DoctorReport, DoctorOptions types in src/core/doctor.ts

## 2. Config Checker

- [ ] 2.1 Implement checkConfig() — verify config.yaml exists, required keys present (models, execution, spec, graph), valid values

## 3. Spec Checker

- [ ] 3.1 Implement checkSpecs() — lint spec files for ### Requirement (3#), #### Scenario (4#), SHALL/SHOULD/MAY keywords, GIVEN/WHEN/THEN structure, with fix for wrong heading levels

## 4. Archive Checker

- [ ] 4.1 Implement checkArchives() — validate each archive has .foreman.yaml (status: archived), required files, no loose graph.yaml/state.yaml/nodes/

## 5. Changes Checker

- [ ] 5.1 Implement checkChanges() — validate in-flight changes have required files, tasks.md uses checkbox format and numbered headings

## 6. Graph Checker

- [ ] 6.1 Implement checkGraphs() — parse graph.yaml, delegate to existing graph-validator, map ValidationResult to DiagnosticResult[]

## 7. Templates Checker

- [ ] 7.1 Implement checkTemplates() — verify expected templates exist, mark missing as fixable with restore from defaults

## 8. Cross-Reference Checker

- [ ] 8.1 Implement checkCrossRefs() — verify graph node deps exist, change dirs match graph state, spec file refs resolve

## 9. Doctor Orchestrator & CLI

- [ ] 9.1 Implement runDoctor(), applyFixes(), formatReport() orchestrator and src/cli/doctor.ts with makeDoctorCommand(), register in src/index.ts

## 10. Tests

- [ ] 10.1 Unit tests for all checkers (checkConfig, checkSpecs, checkArchives, checkChanges, checkGraphs, checkTemplates, checkCrossRefs) and runDoctor orchestrator
- [ ] 10.2 Integration tests for CLI command (foreman doctor, foreman doctor --fix, foreman doctor --category specs)
