# Design: init-dx

## Context

Current state: `src/cli/init.ts` is ~194 lines. It creates directories, writes `config.yaml`, and writes 4 markdown templates. The `--with-claude` flag writes an empty stub. Post-init message references a non-existent command. Default config omits `execution.verify`. No schema, no examples, no gitignore, no doctor integration.

The `.claude/` files already exist in the live repo under `.claude/agents/`, `.claude/commands/`, `.claude/hooks/`, `.claude/skills/`. There are 17 files totaling ~1500 lines. They need to be embedded in the CLI distribution so `specwork init` can write them without a network call or repo clone.

## Goals / Non-Goals

**Goals:**
- `specwork init` writes a complete, working Specwork environment with zero flags
- All 17 `.claude/` files written from embedded CLI content
- `schema.yaml` and `examples/` written during init
- `.specwork/.gitignore` written during init
- `specwork doctor` auto-runs at end of init and migrate
- `specwork init migrate` provides a safe, automated `openspec/` → `.specwork/` migration
- `--with-claude` flag removed; `--force` flag added for idempotent re-init
- Post-init message corrected to `specwork plan`
- Default config includes `execution.verify: 'gates'`

**Non-Goals:**
- Dry-run migration mode (git is the rollback)
- Non-destructive migration (accumulating both layouts is worse)
- Changes to `specwork doctor` internals
- Plugin/registry system for distributing `.claude/` files
- Windows path separator handling

## Decisions

### Decision: Template Module Pattern (`src/templates/claude-files.ts`)

Embedding 17 files inline in `init.ts` would make it 2000+ lines — unreadable and unmaintainable. Instead, create a dedicated `src/templates/claude-files.ts` module that exports a single `CLAUDE_FILES` record (`Record<string, string>`) keyed by relative path (e.g., `.claude/agents/specwork-implementer.md`). `init.ts` imports this and iterates over entries to write each file.

This keeps `init.ts` focused on orchestration logic and makes the embedded content easy to diff and update when `.claude/` files evolve.

**Alternative considered:** Reading `.claude/` files at runtime from the repo directory. Rejected — breaks when the CLI is installed globally via npm/brew and the repo directory is not present.

### Decision: Destructive Migration (No Dry-Run Mode)

`specwork init migrate` deletes `openspec/` after copying. Git provides rollback (`git checkout openspec/`). A dry-run flag adds complexity with little value — users can inspect the mapping table in the proposal and trust git.

**Validation guard**: migrate runs `specwork doctor` after moving files. If doctor fails, the migration summary clearly shows which checks failed. The user can `git checkout openspec/` and investigate.

### Decision: Flatten `openspec/specs/<name>/spec.md` → `.specwork/specs/<name>.md`

The `openspec/specs/` layout uses subdirectories (`<name>/spec.md`). Specwork's `.specwork/specs/` layout uses flat files (`<name>.md`). Flatten on migration — the subdirectory adds no value for single-file specs.

### Decision: `--force` for Idempotent Re-Init

Keep `--force` flag. It enables re-initializing when `.claude/` files are updated in a new CLI version. Without it, the only way to refresh embedded files is to manually delete `.specwork/` and `.claude/`.

### Decision: Doctor Auto-Run Integration

Call the existing `runDoctor()` function (from `src/core/doctor.ts`) directly at the end of `makeInitCommand()` and `migrate`. Do not shell out — avoids a subprocess with no access to process context. Display results inline using the existing output formatter.

## Risks / Trade-offs

- [Embedding 1500+ lines of content in a TS module] → Mitigated by the template module pattern; content is in a separate file, not inlined in init logic
- [`.claude/` files evolving after init] → `--force` re-init refreshes all embedded files; this is an expected workflow
- [Migration deletes openspec/ before doctor runs] → Files are in git; doctor failure is non-destructive in the git sense
- [Users with custom `.claude/` modifications] → `--force` would overwrite customizations; this is documented behavior (init is for fresh setups)

## Migration Plan

`specwork init migrate` steps:
1. Validate `openspec/` exists at `cwd/openspec/` — error if not
2. If `.specwork/` does not exist, run full `specwork init` first
3. Scan `openspec/specs/` — for each `<name>/spec.md`, copy to `.specwork/specs/<name>.md`
4. Scan `openspec/changes/` — for each change directory:
   - Copy `proposal.md` → `.specwork/changes/<name>/proposal.md`
   - Copy `specs/<specname>/spec.md` → `.specwork/changes/<name>/specs/<specname>.md`
5. If `openspec/config.yaml` exists — merge relevant fields into `.specwork/config.yaml`
6. Delete `openspec/` directory recursively
7. Run `specwork doctor` — display results
8. Output migration summary table (files moved, counts, any failures)

## Open Questions

None — all answered by user during planning.
