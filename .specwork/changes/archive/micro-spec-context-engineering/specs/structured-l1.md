### Requirement: Structured L1 Extraction After Node Completion

After a node passes verification, the `specwork-summarizer` agent MUST write `L1-structured.json` to the node's artifact directory alongside the existing `L1.md`. The JSON file MUST conform to:

```
{
  decisions: string[],   // architectural choices made and why
  contracts: string[],   // exported types, functions, interfaces created
  enables: string[],     // what downstream nodes can now do or assume
  changed: string[]      // file paths modified or created
}
```

All arrays MAY be empty but the object MUST always be valid JSON. The existing `L0.md`, `L1.md`, and `L2.md` artifacts are unchanged.

#### Scenario: Summarizer writes L1-structured.json after verify pass
Given a node has passed verification
When the `specwork-summarizer` agent runs
Then `L1-structured.json` is written to `.specwork/nodes/<change>/<node>/L1-structured.json`
And the file contains valid JSON with `decisions`, `contracts`, `enables`, and `changed` arrays
And `L1.md` is still written as before (unchanged format)

#### Scenario: L1-structured.json decisions capture architectural choices
Given an implementer node that chose to use a discriminated union over a string enum
When the summarizer writes `L1-structured.json`
Then the `decisions` array contains an entry describing this choice and its rationale

#### Scenario: L1-structured.json contracts list exported interfaces
Given an implementer node that created `interface MicroSpecBundle` and function `composeMicroSpec`
When the summarizer writes `L1-structured.json`
Then the `contracts` array contains entries for each exported symbol with their signatures

#### Scenario: Assembler reads L1-structured.json programmatically
Given a child node whose parent has `L1-structured.json`
When the micro-spec is composed for the child node
Then the `## Parent Decisions` section is populated from the JSON `decisions` and `contracts` arrays
And the assembler does NOT parse `L1.md` with regex to extract this data

#### Scenario: Assembler falls back gracefully when L1-structured.json absent
Given a child node whose parent has `L1.md` but no `L1-structured.json`
When the micro-spec is composed for the child node
Then the `## Parent Decisions` section is omitted (not rendered empty)
And no error is thrown
