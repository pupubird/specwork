import { Command } from 'commander';
import { writeYaml, writeMarkdown, ensureDir, exists } from '../io/filesystem.js';
import { output } from '../utils/output.js';
import { success, info, warn } from '../utils/logger.js';
import { ForemanError } from '../utils/errors.js';
import { ExitCode } from '../types/index.js';
import path from 'node:path';
import fs from 'node:fs';

// ── Default config.yaml content ────────────────────────────────────────────

const DEFAULT_CONFIG = {
  models: {
    default: 'sonnet',
    test_writer: 'opus',
    summarizer: 'haiku',
    verifier: 'haiku',
  },
  execution: {
    max_retries: 2,
    expand_limit: 1,
    parallel_mode: 'parallel',
    snapshot_refresh: 'after_each_node',
  },
  context: {
    ancestors: 'L0',
    parents: 'L1',
  },
  spec: {
    schema: 'spec-driven',
    specs_dir: '.foreman/specs',
    changes_dir: '.foreman/changes',
    archive_dir: '.foreman/changes/archive',
    templates_dir: '.foreman/templates',
  },
  graph: {
    graphs_dir: '.foreman/graph',
    nodes_dir: '.foreman/nodes',
  },
  environments: {
    env_dir: '.foreman/env',
    active: 'development',
  },
};

// ── Embedded templates ─────────────────────────────────────────────────────

const TEMPLATES: Record<string, string> = {
  'proposal.md': `# Proposal: <!-- Change Name -->

## Problem
<!-- What is broken or missing? Why does it matter? -->

## Solution
<!-- High-level description of what we will build or change -->

## Scope
<!-- What is in scope? What is explicitly out of scope? -->

## Success Criteria
<!-- How will we know this is done? -->
`,

  'spec.md': `# Spec: <!-- Capability Name -->

<!-- Delta spec format: use ADDED / MODIFIED / REMOVED / RENAMED sections -->

## ADDED

### Requirement: <!-- Name -->

<!-- SHALL/MUST = required, SHOULD = recommended -->

#### Scenario: <!-- Name -->
- Given <!-- precondition -->
- When <!-- action -->
- Then <!-- expected result -->
`,

  'design.md': `# Design: <!-- Change Name -->

## Architecture
<!-- Key design decisions and rationale -->

## Data Model
<!-- Schema changes if any -->

## Implementation Plan
<!-- Step-by-step technical approach -->

## Risks
<!-- Potential problems and mitigations -->
`,

  'tasks.md': `## 1. <!-- Task Group Name -->

- [ ] 1.1 <!-- Task description -->
- [ ] 1.2 <!-- Task description -->

## 2. <!-- Task Group Name -->

- [ ] 2.1 <!-- Task description -->
- [ ] 2.2 <!-- Task description -->

<!-- Rules:
     - Every task MUST use - [ ] checkbox format (not tracked otherwise)
     - Group with ## N. numbered headings
     - Number tasks N.M (group.task)
     - Order by dependency — blockers first
     - Each task should be completable in one session
     - These tasks map directly to graph nodes in foreman graph generate
-->
`,
};

// ── foreman init ───────────────────────────────────────────────────────────

export function makeInitCommand(): Command {
  return new Command('init')
    .description('Initialize a Foreman project in the current directory')
    .option('--with-claude', 'Also scaffold .claude/ directory structure', false)
    .option('--force', 'Re-initialize even if .foreman/ already exists', false)
    .action((opts: { withClaude: boolean; force: boolean }, cmd: Command) => {
      const cwd = process.cwd();
      const jsonMode = (cmd.parent?.opts() as { json?: boolean })?.json ?? false;

      const foremanDir = path.join(cwd, '.foreman');

      if (exists(foremanDir) && !opts.force) {
        if (jsonMode) {
          output({ initialized: false, reason: 'already_exists', path: foremanDir }, { json: true, quiet: false });
        } else {
          warn(`.foreman/ already exists at ${foremanDir}`);
          warn('Use --force to re-initialize.');
        }
        throw new ForemanError('.foreman/ already exists', ExitCode.ERROR);
      }

      // ── create directory structure ──────────────────────────────────
      const dirs = [
        '.foreman/env',
        '.foreman/graph',
        '.foreman/nodes',
        '.foreman/specs',
        '.foreman/changes/archive',
        '.foreman/templates',
      ];

      for (const dir of dirs) {
        ensureDir(path.join(cwd, dir));
      }

      // ── write config.yaml ────────────────────────────────────────────
      writeYaml(path.join(foremanDir, 'config.yaml'), DEFAULT_CONFIG);

      // ── write templates ───────────────────────────────────────────────
      for (const [filename, content] of Object.entries(TEMPLATES)) {
        writeMarkdown(path.join(foremanDir, 'templates', filename), content);
      }

      // ── .claude/ structure ────────────────────────────────────────────
      if (opts.withClaude) {
        const claudeDirs = [
          '.claude/agents',
          '.claude/skills',
          '.claude/commands',
          '.claude/hooks',
        ];
        for (const dir of claudeDirs) {
          ensureDir(path.join(cwd, dir));
        }
        const note = `# Foreman Claude Integration\n\nAgent, skill, hook, and command files are distributed via the Foreman plugin.\nSee: https://github.com/pupubird/foreman\n`;
        writeMarkdown(path.join(cwd, '.claude', 'FOREMAN.md'), note);
      }

      if (jsonMode) {
        output({ initialized: true, path: foremanDir, dirs }, { json: true, quiet: false });
      } else {
        success(`Foreman project initialized in ${cwd}`);
        info('');
        info('Created:');
        for (const dir of dirs) {
          info(`  ${dir}/`);
        }
        info('  .foreman/config.yaml');
        info('  .foreman/templates/ (4 templates)');
        if (opts.withClaude) info('  .claude/ (agents, skills, commands, hooks)');
        info('');
        info('Next: foreman new <change-name>');
      }

    });
}
