## ADDED Requirements

### Requirement: <!-- requirement name, under 50 chars -->
The system SHALL <!-- describe the core behavior -->.

#### Scenario: <!-- descriptive scenario name -->
- **GIVEN** <!-- initial state (optional) -->
- **WHEN** <!-- condition or trigger -->
- **THEN** <!-- expected outcome -->
- **AND** <!-- additional outcome (optional) -->

<!-- Guidelines:
     - Requirement headers: exactly ### (3 hashtags)
     - Scenario headers: exactly #### (4 hashtags) — CRITICAL, never use 3
     - Use SHALL/MUST for absolute; SHOULD for recommended; MAY for optional
     - Every requirement needs at least one testable scenario
     - Behavior only — no class/function names, no library choices

     Other delta sections:

     ## MODIFIED Requirements
     ### Requirement: <Existing Name — exact match>
     The system SHALL <updated behavior>. ← (was: <previous behavior>)
     [Must include FULL requirement block, not a diff fragment]

     ## REMOVED Requirements
     ### Requirement: <Name Being Removed>
     **Reason**: <why>
     **Migration**: <how to adapt>

     ## RENAMED Requirements
     - FROM: `### Requirement: Old Name`
     - TO: `### Requirement: New Name`
-->
