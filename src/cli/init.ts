import { Command } from 'commander';
import { writeYaml, writeMarkdown, ensureDir, exists } from '../io/filesystem.js';
import { output } from '../utils/output.js';
import { success, info, warn } from '../utils/logger.js';
import { ForemanError } from '../utils/errors.js';
import { ExitCode } from '../types/index.js';
import { CLAUDE_FILES, CLAUDE_SETTINGS, SCHEMA_YAML, EXAMPLE_GRAPH, FOREMAN_GITIGNORE } from '../templates/claude-files.js';
import { migrateOpenspec } from '../core/migrate.js';
import { runDoctor } from '../core/doctor.js';
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
    verify: 'gates',
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

// ── Core init logic (shared by init and migrate) ──────────────────────────

function initializeProject(cwd: string): string[] {
  const foremanDir = path.join(cwd, '.foreman');

  // ── create directory structure ──────────────────────────────────
  const dirs = [
    '.foreman/env',
    '.foreman/graph',
    '.foreman/nodes',
    '.foreman/specs',
    '.foreman/changes/archive',
    '.foreman/templates',
    '.foreman/examples',
  ];

  for (const dir of dirs) {
    ensureDir(path.join(cwd, dir));
  }

  // ── write config.yaml ────────────────────────────────────────────
  writeYaml(path.join(foremanDir, 'config.yaml'), DEFAULT_CONFIG);

  // ── write schema.yaml ────────────────────────────────────────────
  fs.writeFileSync(path.join(foremanDir, 'schema.yaml'), SCHEMA_YAML, 'utf-8');

  // ── write example graph ──────────────────────────────────────────
  fs.writeFileSync(path.join(foremanDir, 'examples', 'example-graph.yaml'), EXAMPLE_GRAPH, 'utf-8');

  // ── write .gitignore ─────────────────────────────────────────────
  fs.writeFileSync(path.join(foremanDir, '.gitignore'), FOREMAN_GITIGNORE, 'utf-8');

  // ── write templates ───────────────────────────────────────────────
  for (const [filename, content] of Object.entries(TEMPLATES)) {
    writeMarkdown(path.join(foremanDir, 'templates', filename), content);
  }

  // ── write .claude/ files (batteries-included) ─────────────────────
  for (const [relPath, content] of Object.entries(CLAUDE_FILES)) {
    const fullPath = path.join(cwd, relPath);
    ensureDir(path.dirname(fullPath));
    fs.writeFileSync(fullPath, content, 'utf-8');
    // Make hook scripts executable
    if (relPath.endsWith('.sh')) {
      fs.chmodSync(fullPath, 0o755);
    }
  }

  // ── write .claude/settings.json ───────────────────────────────────
  const settingsPath = path.join(cwd, '.claude', 'settings.json');
  ensureDir(path.dirname(settingsPath));
  fs.writeFileSync(settingsPath, JSON.stringify(CLAUDE_SETTINGS, null, 2) + '\n', 'utf-8');

  return dirs;
}

// ── Run doctor and display results ────────────────────────────────────────

function runDoctorCheck(cwd: string, jsonMode: boolean): void {
  try {
    const report = runDoctor({ root: cwd });
    if (!jsonMode) {
      info('');
      info('Health check:');
      for (const check of report.checks) {
        for (const r of check.results) {
          info(`  ${r.pass ? '✓' : '✗'} ${r.label}`);
        }
      }
      info(`  ${report.totalPass} passed, ${report.totalFail} failed`);
    }
  } catch {
    // Doctor failure is non-fatal for init
  }
}

// ── foreman init ───────────────────────────────────────────────────────────

export function makeInitCommand(): Command {
  const initCmd = new Command('init')
    .description('Initialize a Foreman project in the current directory')
    .option('--force', 'Re-initialize even if .foreman/ already exists', false)
    .action((opts: { force: boolean }, cmd: Command) => {
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

      const dirs = initializeProject(cwd);

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
        info('  .foreman/schema.yaml');
        info('  .foreman/examples/example-graph.yaml');
        info('  .foreman/.gitignore');
        info('  .foreman/templates/ (4 templates)');
        info('  .claude/ (agents, skills, commands, hooks, settings)');
        info('');
        info('Next: foreman plan "<description>"');

        // Auto-run doctor
        runDoctorCheck(cwd, jsonMode);
      }
    });

  // ── foreman init migrate ────────────────────────────────────────────

  initCmd
    .command('migrate')
    .description('Migrate existing openspec/ directory into .foreman/ structure')
    .action((_, cmd: Command) => {
      const cwd = process.cwd();
      const jsonMode = (cmd.parent?.parent?.opts() as { json?: boolean })?.json ?? false;

      const foremanDir = path.join(cwd, '.foreman');

      // Auto-init if .foreman/ doesn't exist
      if (!exists(foremanDir)) {
        initializeProject(cwd);
        if (!jsonMode) {
          success('Foreman project initialized (auto)');
        }
      }

      const result = migrateOpenspec(cwd);

      if (jsonMode) {
        output({
          migrated: true,
          specsMigrated: result.specsMigrated,
          changesMigrated: result.changesMigrated,
          filesTotal: result.filesTotal,
          openspecRemoved: result.openspecRemoved,
        }, { json: true, quiet: false });
      } else {
        success('Migration complete');
        info('');
        info('Migrated:');
        info(`  ${result.specsMigrated} spec(s) → .foreman/specs/`);
        info(`  ${result.changesMigrated} change(s) → .foreman/changes/`);
        info(`  ${result.filesTotal} file(s) total`);
        info('  openspec/ removed');

        // Auto-run doctor
        runDoctorCheck(cwd, jsonMode);
      }
    });

  return initCmd;
}
