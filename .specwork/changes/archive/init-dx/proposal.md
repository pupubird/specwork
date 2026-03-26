# Proposal: init-dx — Batteries-Included Init & OpenSpec Migration

## Why

Specwork's value proposition is spec-driven, test-first, graph-based AI development. The `.claude/` directory — agents, skills, commands, hooks — is not optional infrastructure. It *is* Specwork from the perspective of Claude Code. Yet today, `specwork init` creates an empty scaffold and buries the critical integration behind a `--with-claude` flag. New users who miss this flag get a broken experience: `specwork plan` and `specwork go` are undefined commands, agent roles don't exist, hooks don't fire. The flag is a footgun masquerading as a feature.

Three other problems compound this:

1. **Even with `--with-claude`, the stub is empty.** A placeholder note is written instead of the actual 17 `.claude/` files. Users must manually copy them from the repo.
2. **The post-init message is wrong.** It says `specwork new` — the correct command is `specwork plan`.
3. **No validation after init.** Users have no way to confirm the environment is healthy before attempting their first workflow.

For existing `openspec/` users there is a fourth problem: no migration path. Accumulated specs and change proposals live in an incompatible layout. A manual migration is error-prone, and maintaining two parallel systems is worse.

## What Changes

### New Capabilities
- `specwork init` (enhanced): batteries-included init — always writes all `.claude/` files, `schema.yaml`, `examples/`, `.gitignore`, correct config, and auto-runs `specwork doctor`
- `specwork init migrate`: destructive (git-recoverable) migration from `openspec/` to `.specwork/`

### Modified Capabilities
- `specwork init`: removes `--with-claude` flag; adds `--force` idempotent re-init; fixes post-init message and default config

## Impact

- **New users**: `specwork init` just works. First `specwork plan` is seconds away, not a manual file-copy session.
- **Existing `openspec/` users**: one command migrates their entire spec library into Specwork's layout.
- **No breaking changes** to any other commands — only `init.ts` and a new `src/templates/claude-files.ts` are touched.
