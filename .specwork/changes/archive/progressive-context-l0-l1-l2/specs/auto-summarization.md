### Requirement: Summarizer Agent Invocation After Verify Pass

After a node's verification passes, the engine workflow MUST spawn the `specwork-summarizer` agent before calling `node complete`. The summarizer SHALL write three artifact files to the node's artifact directory: `L0.md` (one-line headline), `L1.md` (~100 tokens of structured context), and `L2.md` (full diff and verify output). These artifacts enable the progressive context chain for downstream nodes.

The `--l0` flag on `specwork node complete` SHALL become optional. If the flag is absent, the CLI MUST read the L0 headline from `L0.md` in the node's artifact directory. If neither the flag nor the file is present, `l0` in the response SHALL be null (no error).

The `next_action` returned by `specwork node verify` on PASS MUST reflect this two-step flow: spawn summarizer, then complete the node.

#### Scenario: node complete reads L0 from disk when flag absent
Given a node that has passed verification
And `L0.md` exists in the node's artifact directory containing `impl-1-1: Added auth middleware`
When `specwork node complete <change> impl-1-1` is called without `--l0`
Then the node transitions to complete
And the response `l0` field contains `Added auth middleware`
And the state records the L0 headline

#### Scenario: node complete with --l0 flag overrides file
Given a node that has passed verification
And `L0.md` exists in the node's artifact directory
When `specwork node complete <change> <node> --l0 "Explicit override"` is called
Then the response `l0` field contains `Explicit override`
And `L0.md` on disk is updated with the provided value

#### Scenario: node complete succeeds with null L0 when neither flag nor file present
Given a node that has passed verification
And no `L0.md` exists in the node's artifact directory
When `specwork node complete <change> <node>` is called without `--l0`
Then the node transitions to complete
And the response `l0` field is null
And the command exits with code 0

#### Scenario: verify:pass next_action instructs summarizer spawn
Given `specwork node verify --json` returns verdict PASS
Then the `next_action.command` in the response is `subagent:spawn`
And the description references spawning the summarizer
And `next_action.on_pass` is `specwork node complete <change> <node>` without `--l0`

#### Scenario: node:start next_action no longer references context assemble
Given `specwork node start --json` is called for a node
Then the `next_action.command` in the response is NOT `specwork context assemble`
And the description indicates context is inline in the response
