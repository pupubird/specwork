import { Command } from 'commander';
import { writeMarkdown, writeYaml, readMarkdown, ensureDir, exists } from '../io/filesystem.js';
import { findForemanRoot } from '../utils/paths.js';
import { output } from '../utils/output.js';
import { success, info, warn } from '../utils/logger.js';
import { ForemanError } from '../utils/errors.js';
import { ExitCode } from '../types/index.js';
import path from 'node:path';
import fs from 'node:fs';

// ── foreman new <change> ───────────────────────────────────────────────────

export function makeNewCommand(): Command {
  return new Command('new')
    .description('Create a new change from templates')
    .argument('<change>', 'Change name (kebab-case)')
    .action((change: string, _opts, cmd: Command) => {
      const root = findForemanRoot();
      const jsonMode = (cmd.parent?.opts() as { json?: boolean })?.json ?? false;

      // Validate change name
      if (!/^[a-z0-9][a-z0-9-]*$/.test(change)) {
        throw new ForemanError(
          `Invalid change name "${change}": use lowercase letters, numbers, and hyphens only`,
          ExitCode.ERROR
        );
      }

      const changeDir = path.join(root, '.foreman', 'changes', change);

      if (exists(changeDir)) {
        if (jsonMode) {
          output({ created: false, reason: 'already_exists', path: changeDir }, { json: true, quiet: false });
        } else {
          warn(`Change "${change}" already exists at ${changeDir}`);
        }
        throw new ForemanError(`Change "${change}" already exists`, ExitCode.ERROR);
      }

      ensureDir(changeDir);
      ensureDir(path.join(changeDir, 'specs'));

      // ── copy templates ────────────────────────────────────────────────
      const templatesDir = path.join(root, '.foreman', 'templates');
      const templatesToCopy = ['proposal.md', 'design.md', 'tasks.md'];

      const copied: string[] = [];
      for (const tmpl of templatesToCopy) {
        const src = path.join(templatesDir, tmpl);
        const dst = path.join(changeDir, tmpl);
        if (exists(src)) {
          const content = readMarkdown(src);
          writeMarkdown(dst, content);
          copied.push(tmpl);
        }
      }

      // ── .foreman.yaml metadata ─────────────────────────────────────────
      const metadata = {
        schema: 'foreman-change/v1',
        change,
        created_at: new Date().toISOString(),
        status: 'draft',
      };
      writeYaml(path.join(changeDir, '.foreman.yaml'), metadata);

      const result = {
        created: true,
        change,
        path: changeDir,
        files: ['.foreman.yaml', ...copied],
      };

      if (jsonMode) {
        output(result, { json: true, quiet: false });
      } else {
        success(`Change '${change}' created.`);
        info('');
        info(`  ${path.relative(root, changeDir)}/`);
        for (const f of result.files) {
          info(`    ${f}`);
        }
        info('');
        info(`Edit the files in .foreman/changes/${change}/ then run:`);
        info(`  foreman graph generate ${change}`);
      }
    });
}
