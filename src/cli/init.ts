import { Command } from 'commander';
import { writeYaml, writeMarkdown, ensureDir, exists } from '../io/filesystem.js';
import { output } from '../utils/output.js';
import { success, info, warn } from '../utils/logger.js';
import { SpecworkError } from '../utils/errors.js';
import { ExitCode } from '../types/index.js';
import { CLAUDE_FILES, CLAUDE_SETTINGS, SCHEMA_YAML, EXAMPLE_GRAPH, SPECWORK_GITIGNORE } from '../templates/claude-files.js';
import { migrateOpenspec } from '../core/migrate.js';
import { runDoctor } from '../core/doctor.js';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { stringifyYaml } from '../io/yaml.js';

// ── Default config.yaml content ────────────────────────────────────────────

export const DEFAULT_CONFIG = {
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
    specs_dir: '.specwork/specs',
    changes_dir: '.specwork/changes',
    archive_dir: '.specwork/changes/archive',
    templates_dir: '.specwork/templates',
  },
  graph: {
    graphs_dir: '.specwork/graph',
    nodes_dir: '.specwork/nodes',
  },
  environments: {
    env_dir: '.specwork/env',
    active: 'development',
  },
};

// ── Embedded templates ─────────────────────────────────────────────────────

export const TEMPLATES: Record<string, string> = {
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
     - These tasks map directly to graph nodes in specwork graph generate
-->
`,
};

// ── Core init logic (shared by init and migrate) ──────────────────────────

function initializeProject(cwd: string): string[] {
  const specworkDir = path.join(cwd, '.specwork');

  // ── create directory structure ──────────────────────────────────
  const dirs = [
    '.specwork/env',
    '.specwork/graph',
    '.specwork/nodes',
    '.specwork/specs',
    '.specwork/changes/archive',
    '.specwork/templates',
    '.specwork/examples',
  ];

  for (const dir of dirs) {
    ensureDir(path.join(cwd, dir));
  }

  // ── read package version ──────────────────────────────────────────
  const __fn = fileURLToPath(import.meta.url);
  const __dn = dirname(__fn);
  let pkgVersion = '0.0.0';
  for (const rel of [join(__dn, '..', 'package.json'), join(__dn, '..', '..', 'package.json')]) {
    if (fs.existsSync(rel)) {
      pkgVersion = (JSON.parse(readFileSync(rel, 'utf8')) as { version: string }).version;
      break;
    }
  }

  // ── write config.yaml ────────────────────────────────────────────
  const configWithVersion = { ...DEFAULT_CONFIG, specwork_version: pkgVersion };
  writeYaml(path.join(specworkDir, 'config.yaml'), configWithVersion);

  // ── write schema.yaml ────────────────────────────────────────────
  fs.writeFileSync(path.join(specworkDir, 'schema.yaml'), SCHEMA_YAML, 'utf-8');

  // ── write example graph ──────────────────────────────────────────
  fs.writeFileSync(path.join(specworkDir, 'examples', 'example-graph.yaml'), EXAMPLE_GRAPH, 'utf-8');

  // ── write .gitignore ─────────────────────────────────────────────
  fs.writeFileSync(path.join(specworkDir, '.gitignore'), SPECWORK_GITIGNORE, 'utf-8');

  // ── write templates ───────────────────────────────────────────────
  for (const [filename, content] of Object.entries(TEMPLATES)) {
    writeMarkdown(path.join(specworkDir, 'templates', filename), content);
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

  // ── generate manifest ────────────────────────────────────────────
  const managedFiles: Record<string, string> = {};
  for (const [filename, content] of Object.entries(TEMPLATES)) {
    managedFiles[`.specwork/templates/${filename}`] = content;
  }
  for (const [relPath, content] of Object.entries(CLAUDE_FILES)) {
    managedFiles[relPath] = content;
  }
  managedFiles['.claude/settings.json'] = JSON.stringify(CLAUDE_SETTINGS, null, 2) + '\n';
  managedFiles['.specwork/schema.yaml'] = SCHEMA_YAML;
  managedFiles['.specwork/examples/example-graph.yaml'] = EXAMPLE_GRAPH;
  managedFiles['.specwork/.gitignore'] = SPECWORK_GITIGNORE;
  managedFiles['.specwork/config.yaml'] = fs.readFileSync(path.join(specworkDir, 'config.yaml'), 'utf-8');

  // Compute checksums inline (avoid circular dependency with updater.ts)
  const checksums: Record<string, string> = {};
  for (const [relPath, content] of Object.entries(managedFiles)) {
    checksums[relPath] = crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  // Write manifest
  const manifestPath = path.join(specworkDir, 'manifest.yaml');
  const manifestData = {
    specwork_version: pkgVersion,
    generated_at: new Date().toISOString(),
    files: checksums,
  };
  fs.writeFileSync(manifestPath, stringifyYaml(manifestData), 'utf-8');

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

// ── specwork init ───────────────────────────────────────────────────────────

export function makeInitCommand(): Command {
  const initCmd = new Command('init')
    .description('Initialize a Specwork project in the current directory')
    .option('--force', 'Re-initialize even if .specwork/ already exists', false)
    .action((opts: { force: boolean }, cmd: Command) => {
      const cwd = process.cwd();
      const jsonMode = (cmd.parent?.opts() as { json?: boolean })?.json ?? false;

      const specworkDir = path.join(cwd, '.specwork');

      if (exists(specworkDir) && !opts.force) {
        if (jsonMode) {
          output({ initialized: false, reason: 'already_exists', path: specworkDir }, { json: true, quiet: false });
        } else {
          warn(`.specwork/ already exists at ${specworkDir}`);
          warn('Use --force to re-initialize.');
        }
        throw new SpecworkError('.specwork/ already exists', ExitCode.ERROR);
      }

      const dirs = initializeProject(cwd);

      if (jsonMode) {
        output({ initialized: true, path: specworkDir, dirs }, { json: true, quiet: false });
      } else {
        success(`Specwork project initialized in ${cwd}`);
        info('');
        info('Created:');
        for (const dir of dirs) {
          info(`  ${dir}/`);
        }
        info('  .specwork/config.yaml');
        info('  .specwork/schema.yaml');
        info('  .specwork/examples/example-graph.yaml');
        info('  .specwork/.gitignore');
        info('  .specwork/templates/ (4 templates)');
        info('  .claude/ (agents, skills, commands, hooks, settings)');
        info('');
        info('Next: specwork plan "<description>"');

        // Auto-run doctor
        runDoctorCheck(cwd, jsonMode);
      }
    });

  // ── specwork init migrate ────────────────────────────────────────────

  initCmd
    .command('migrate')
    .description('Migrate existing openspec/ directory into .specwork/ structure')
    .action((_, cmd: Command) => {
      const cwd = process.cwd();
      const jsonMode = (cmd.parent?.parent?.opts() as { json?: boolean })?.json ?? false;

      const specworkDir = path.join(cwd, '.specwork');

      // Auto-init if .specwork/ doesn't exist
      if (!exists(specworkDir)) {
        initializeProject(cwd);
        if (!jsonMode) {
          success('Specwork project initialized (auto)');
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
        info(`  ${result.specsMigrated} spec(s) → .specwork/specs/`);
        info(`  ${result.changesMigrated} change(s) → .specwork/changes/`);
        info(`  ${result.filesTotal} file(s) total`);
        info('  openspec/ removed');

        // Auto-run doctor
        runDoctorCheck(cwd, jsonMode);
      }
    });

  return initCmd;
}
