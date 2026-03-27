import { Command } from 'commander';
import { findSpecworkRoot } from '../utils/paths.js';
import { output } from '../utils/output.js';
import { success, info, warn } from '../utils/logger.js';
import { SpecworkError } from '../utils/errors.js';
import { ExitCode } from '../types/index.js';
import { runUpdate, classifyFiles, loadManifest, checkLockedWorkflows } from '../core/updater.js';
import { runDoctor } from '../core/doctor.js';
import { DEFAULT_CONFIG, TEMPLATES } from './init.js';
import { CLAUDE_FILES, CLAUDE_SETTINGS, SCHEMA_YAML, EXAMPLE_GRAPH, SPECWORK_GITIGNORE } from '../templates/claude-files.js';

export function makeUpdateCommand(): Command {
  return new Command('update')
    .description('Update project files to the current specwork version')
    .option('--dry-run', 'Preview changes without modifying files', false)
    .option('--force', 'Update even if versions match', false)
    .action((opts: { dryRun: boolean; force: boolean }, cmd: Command) => {
      const root = findSpecworkRoot();
      const jsonMode = (cmd.parent?.opts() as { json?: boolean })?.json ?? false;
      const quietMode = (cmd.parent?.opts() as { quiet?: boolean })?.quiet ?? false;

      const result = runUpdate(root, { dryRun: opts.dryRun, force: opts.force });

      if (jsonMode) {
        output({
          updated: result.filesUpdated,
          backedUp: result.filesBackedUp,
          configFieldsAdded: result.configFieldsAdded,
          deprecated: result.deprecated,
          previousVersion: result.previousVersion,
          newVersion: result.newVersion,
          backupPath: result.backupPath,
          dryRun: result.dryRun,
          migrationsRun: result.migrationsRun,
        }, { json: true, quiet: quietMode });
        return;
      }

      const isUpToDate = result.filesUpdated === 0 && result.previousVersion === result.newVersion;

      // Already up to date
      if (isUpToDate && !result.dryRun) {
        success(`Already up to date (${result.newVersion})`);
        return;
      }

      if (result.dryRun) {
        if (isUpToDate) {
          success(`Already up to date (${result.newVersion})`);
          return;
        }

        info('Dry-run preview — no files will be modified');
        info('');

        // Show what would change
        const manifestData = loadManifest(root);
        const managedFiles = buildFileList();
        const classifications = classifyFiles(
          manifestData?.files ?? null,
          Object.keys(managedFiles),
          root,
        );

        for (const file of classifications) {
          if (file.status === 'new') {
            info(`  create  ${file.path}`);
          } else if (file.status === 'modified') {
            info(`  update (modified — will backup)  ${file.path}`);
          } else {
            info(`  update (unmodified)  ${file.path}`);
          }
        }

        info('');
        info(`Would update ${result.filesUpdated} file(s), backup ${result.filesBackedUp} file(s)`);
        if (result.configFieldsAdded.length > 0) {
          info(`Would add config fields: ${result.configFieldsAdded.join(', ')}`);
        }
        if (result.deprecated.length > 0) {
          warn(`Deprecated config fields: ${result.deprecated.join(', ')}`);
        }
        return;
      }

      // Real update completed
      success(`Updated ${result.previousVersion ?? 'unknown'} → ${result.newVersion}`);
      info('');
      info(`  ${result.filesUpdated} files updated`);
      info(`  ${result.filesBackedUp} files backed up`);
      if (result.backupPath) {
        info(`  Backups at: ${result.backupPath}`);
      }
      if (result.configFieldsAdded.length > 0) {
        info(`  Config fields added: ${result.configFieldsAdded.join(', ')}`);
      }
      if (result.deprecated.length > 0) {
        warn(`  Deprecated config fields: ${result.deprecated.join(', ')}`);
      }
      if (result.migrationsRun.length > 0) {
        info(`  Migrations executed: ${result.migrationsRun.join(', ')}`);
      }

      // Auto-run doctor
      try {
        const report = runDoctor({ root });
        info('');
        info('Health check:');
        for (const check of report.checks) {
          for (const r of check.results) {
            info(`  ${r.pass ? '✓' : '✗'} ${r.label}`);
          }
        }
        info(`  ${report.totalPass} passed, ${report.totalFail} failed`);
      } catch {
        // Doctor failure is non-fatal for update
      }
    });
}

function buildFileList(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [filename, content] of Object.entries(TEMPLATES)) {
    files[`.specwork/templates/${filename}`] = content;
  }
  for (const [relPath, content] of Object.entries(CLAUDE_FILES)) {
    files[relPath] = content;
  }
  files['.claude/settings.json'] = JSON.stringify(CLAUDE_SETTINGS, null, 2) + '\n';
  files['.specwork/schema.yaml'] = SCHEMA_YAML;
  files['.specwork/examples/example-graph.yaml'] = EXAMPLE_GRAPH;
  files['.specwork/.gitignore'] = SPECWORK_GITIGNORE;
  return files;
}
