# Contributing to Specwork

Thank you for your interest in contributing! This document covers dev setup, PR process, and code style.

---

## Dev Setup

**Requirements:** Node.js ≥ 18, Claude Code CLI

```bash
git clone https://github.com/specwork-ai/specwork.git
cd specwork
npm install
npm run build
```

Run tests:
```bash
npm test
```

Type-check without emitting:
```bash
npm run typecheck
```

---

## Project Structure

```
.specwork/           Specwork's own config, specs, and graphs
.claude/
  agents/           Subagent role definitions (.md with YAML frontmatter)
  skills/           Engine logic loaded into agents (SKILL.md)
  commands/         Slash commands (/project:specwork-*)
  hooks/            Lifecycle hooks (shell scripts)
src/                TypeScript source (CLI entry, utilities)
docs/               Internal documentation
```

The core engine is in `.claude/skills/specwork-engine/SKILL.md`. Subagent roles are in `.claude/agents/`. Configuration lives in `.specwork/config.yaml`.

---

## Making Changes

1. **Fork** the repo and create a branch: `git checkout -b feat/my-feature`
2. **Write a proposal** (for non-trivial changes): `cp .specwork/templates/proposal.md .specwork/changes/my-feature/proposal.md`
3. **Write tests first** if adding new behavior
4. **Implement** the change
5. **Run** `npm run build && npm test && npm run typecheck`
6. **Open a PR** against `main`

For changes to the engine skill, agent definitions, or hook scripts — test end-to-end with a real Claude Code session using the example graph.

---

## PR Process

- Keep PRs focused — one feature or fix per PR
- Link the related issue (if any) in the PR description
- Fill out the PR template
- All CI checks must pass before merge

---

## Code Style

- TypeScript strict mode — no `any`, no `@ts-ignore` without explanation
- ESM modules — `import/export`, no `require()`
- No runtime dependencies beyond what's in `package.json`
- Shell scripts must pass `bash -n` (syntax check) and be marked executable (`chmod +x`)
- Agent/skill/command `.md` files must have valid YAML frontmatter

---

## Where to Find Issues

- [GitHub Issues](https://github.com/specwork-ai/specwork/issues) — bugs and feature requests
- Issues labeled `good first issue` are a good starting point

---

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be respectful.
