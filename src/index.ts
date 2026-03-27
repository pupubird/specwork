#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setVerbose } from './utils/logger.js';
import { SpecworkError } from './utils/errors.js';
import { ExitCode } from './types/index.js';
import { validateConfig } from './core/config-validator.js';

// Porcelain (human-facing)
import { makePlanCommand } from './cli/plan.js';
import { makeGoCommand } from './cli/go.js';
import { makeStatusCommand } from './cli/status.js';
import { makeInitCommand } from './cli/init.js';
import { makeDoctorCommand } from './cli/doctor.js';
import { makeUpdateCommand } from './cli/update.js';
import { makeArchiveCommand } from './cli/archive.js';

// Plumbing (agent-facing)
import { makeNewCommand } from './cli/new.js';
import { makeConfigCommand } from './cli/config.js';
import { makeRunCommand } from './cli/run.js';
import { makeRetryCommand } from './cli/retry.js';
import { makeReportCommand } from './cli/report.js';
import { makeLogCommand } from './cli/log.js';
import { makeNodeCommand } from './cli/node.js';
import { makeGraphCommand } from './cli/graph.js';
import { makeContextCommand } from './cli/context.js';
import { makeSnapshotCommand } from './cli/snapshot.js';

// Read version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
) as { version: string };

const program = new Command();

program
  .name('specwork')
  .description('Spec-driven, test-first, graph-based workflow engine for Claude Code')
  .version(pkg.version, '-v, --version', 'Output the current version')
  .option('--json', 'Output results as JSON', false)
  .option('--quiet', 'Suppress non-essential output', false)
  .option('--verbose', 'Enable verbose debug output', false)
  .option('--cwd <dir>', 'Working directory (default: current directory)')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts() as { verbose: boolean; cwd?: string };
    setVerbose(opts.verbose);
    if (opts.cwd) {
      process.chdir(opts.cwd);
    }
    // Validate config if .specwork exists (skip for init)
    const cmdName = thisCommand.args?.[0] ?? thisCommand.name();
    if (cmdName !== 'init' && cmdName !== 'update') {
      validateConfig();
    }
  });

// ── Porcelain commands (human-facing — these are the ones you remember) ──
program.addCommand(makeInitCommand());
program.addCommand(makePlanCommand());
program.addCommand(makeGoCommand());
program.addCommand(makeStatusCommand());
program.addCommand(makeDoctorCommand());
program.addCommand(makeUpdateCommand());
program.addCommand(makeArchiveCommand());

// ── Plumbing commands (agent-facing — used by the engine skill) ──────────
program.addCommand(makeNewCommand());
program.addCommand(makeConfigCommand());
program.addCommand(makeRunCommand());
program.addCommand(makeRetryCommand());
program.addCommand(makeReportCommand());
program.addCommand(makeLogCommand());
program.addCommand(makeNodeCommand());
program.addCommand(makeGraphCommand());
program.addCommand(makeContextCommand());
program.addCommand(makeSnapshotCommand());

// Custom help to show the porcelain/plumbing split
program.addHelpText('after', `
Workflow:
  specwork init                 One-time project setup
  specwork plan "<description>" Plan a new change from natural language
  specwork go <change>          Run the workflow autonomously
  specwork update                Update project files to current version
  specwork archive <change>     Archive a completed change
  specwork status [change]      Check progress

All other commands are used by the engine internally.
Run: specwork <command> --help  for details on any command.
`);

// Global error handler
program.exitOverride();

try {
  await program.parseAsync(process.argv);
} catch (err) {
  if (err instanceof SpecworkError) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(err.exitCode);
  }
  // commander throws CommanderError for --help / --version — let those exit cleanly
  if (err instanceof Error && 'code' in err) {
    const code = (err as { code: string }).code;
    if (code === 'commander.helpDisplayed' || code === 'commander.version') {
      process.exit(ExitCode.SUCCESS);
    }
  }
  if (err instanceof Error) {
    process.stderr.write(`Unexpected error: ${err.message}\n`);
  }
  process.exit(ExitCode.ERROR);
}
