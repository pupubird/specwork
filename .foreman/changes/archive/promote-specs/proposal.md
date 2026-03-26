## Why

When a change completes and gets archived, its specs (in `.foreman/changes/<name>/specs/`) should be promoted to the source-of-truth directory (`.foreman/specs/`). Currently this never happens — `.foreman/specs/` stays empty forever.

Specs are the behavioral contracts. If a change adds `auth.md` spec and the implementation passes, that spec should become the canonical reference for future changes.

## What Changes

Add spec promotion step to `archiveChange()` — copy `<change>/specs/*.md` to `.foreman/specs/` before removing the change directory.

## Capabilities

### Modified Capabilities
- `archive`: Now promotes specs to `.foreman/specs/` during archive

## Impact

- `.foreman/specs/` becomes a living source of truth
- Future changes can reference deployed specs
- Spec-driven workflow is actually spec-driven
