import { Command } from 'commander';
import { writeMarkdown, writeYaml, readMarkdown, ensureDir, exists } from '../io/filesystem.js';
import { findSpecworkRoot } from '../utils/paths.js';
import { output } from '../utils/output.js';
import { success, info } from '../utils/logger.js';
import { SpecworkError } from '../utils/errors.js';
import { ExitCode } from '../types/index.js';
import path from 'node:path';
import fs from 'node:fs';

// ── slugify description into kebab-case change name ──────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── specwork plan "<description>" ─────────────────────────────────────────

export function makePlanCommand(): Command {
  return new Command('plan')
    .description('Plan a new change from a natural language description')
    .argument('<description>', 'What you want to build (in quotes)')
    .option('--name <name>', 'Override the auto-generated change name')
    .option('--yolo', 'Skip clarifying questions — generate everything from description alone', false)
    .action((description: string, opts: { name?: string; yolo: boolean }, cmd: Command) => {
      const root = findSpecworkRoot();
      const jsonMode = (cmd.parent?.opts() as { json?: boolean })?.json ?? false;

      // Determine change name
      const change = opts.name ?? slugify(description);

      if (!change || !/^[a-z0-9][a-z0-9-]*$/.test(change)) {
        throw new SpecworkError(
          `Invalid change name "${change}": use lowercase letters, numbers, and hyphens only`,
          ExitCode.ERROR
        );
      }

      const changeDir = path.join(root, '.specwork', 'changes', change);

      if (exists(changeDir)) {
        throw new SpecworkError(`Change "${change}" already exists`, ExitCode.ERROR);
      }

      // ── create change directory + files ────────────────────────────────
      ensureDir(changeDir);
      ensureDir(path.join(changeDir, 'specs'));

      // Copy templates and inject description into proposal
      const templatesDir = path.join(root, '.specwork', 'templates');
      const files: string[] = ['.specwork.yaml'];

      // proposal.md — inject description
      const proposalTemplate = path.join(templatesDir, 'proposal.md');
      const proposalContent = exists(proposalTemplate)
        ? readMarkdown(proposalTemplate)
        : '## Why\n\n## What Changes\n';
      const proposalWithDesc = `## Why\n\n${description}\n\n` +
        proposalContent.replace(/^## Why\n+/m, '').replace(/<!--[^>]*-->\n*/g, '');
      writeMarkdown(path.join(changeDir, 'proposal.md'), proposalWithDesc);
      files.push('proposal.md');

      // design.md, tasks.md — copy as-is
      for (const tmpl of ['design.md', 'tasks.md']) {
        const src = path.join(templatesDir, tmpl);
        const dst = path.join(changeDir, tmpl);
        if (exists(src)) {
          writeMarkdown(dst, readMarkdown(src));
        }
        files.push(tmpl);
      }

      // .specwork.yaml metadata — status is "planning" (not "draft")
      const mode = opts.yolo ? 'yolo' : 'brainstorm';
      const metadata = {
        schema: 'specwork-change/v1',
        change,
        description,
        created_at: new Date().toISOString(),
        status: 'planning',
        mode,
      };
      writeYaml(path.join(changeDir, '.specwork.yaml'), metadata);

      // ── output ─────────────────────────────────────────────────────────
      const next_steps = 'Fill in proposal.md, tasks.md, then run: specwork graph generate ' + change;

      if (jsonMode) {
        output({
          change,
          description,
          mode,
          path: changeDir,
          files,
          next_steps,
        }, { json: true, quiet: false });
      } else {
        success(`Change '${change}' planned.`);
        info('');
        info(`  ${path.relative(root, changeDir)}/`);
        for (const f of files) {
          info(`    ${f}`);
        }
        info('');
        info(`Description: ${description}`);
        info('');
        info(`Next: fill in proposal.md & tasks.md, then:`);
        info(`  specwork graph generate ${change}`);
        info(`  specwork go ${change}`);
      }
    });
}
