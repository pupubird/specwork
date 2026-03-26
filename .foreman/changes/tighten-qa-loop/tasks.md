## 1. Verify Command

- [ ] 1.1 Add `foreman node verify` subcommand to `src/cli/node.ts` — runs tsc-check, tests-pass, scope-check deterministically, outputs structured JSON verdict
- [ ] 1.2 Add tests for verify command in `src/__tests__/cli/verify.test.ts`

## 2. Engine Skill Update

- [ ] 2.1 Update engine skill Section 3 (Verification) with the auto-retry loop using `foreman node verify`
- [ ] 2.2 Update verifier and QA agent definitions with machine-parseable verdict format
