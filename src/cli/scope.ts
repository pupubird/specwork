import { Command } from 'commander';
import { findSpecworkRoot } from '../utils/paths.js';
import { setScope, clearScope, checkScope, getScope } from '../core/scope-manager.js';
import { output } from '../utils/output.js';
import { success, info } from '../utils/logger.js';
import { ExitCode } from '../types/index.js';

// ── specwork scope set ─────────────────────────────────────────────────────────

const setCmd = new Command('set')
  .description('Set allowed write paths for the current node')
  .argument('<paths...>', 'One or more allowed path prefixes')
  .action((paths: string[], _opts, cmd: Command) => {
    const root = findSpecworkRoot();
    const jsonMode = (cmd.parent?.parent?.opts() as { json?: boolean })?.json ?? false;

    setScope(root, paths);

    if (jsonMode) {
      output({ scope: paths }, { json: true, quiet: false });
    } else {
      success(`Scope set (${paths.length} path${paths.length === 1 ? '' : 's'}):`);
      for (const p of paths) {
        info(`  ${p}`);
      }
    }
  });

// ── specwork scope clear ───────────────────────────────────────────────────────

const clearCmd = new Command('clear')
  .description('Clear the current scope (allow all writes)')
  .action((_opts, cmd: Command) => {
    const root = findSpecworkRoot();
    const jsonMode = (cmd.parent?.parent?.opts() as { json?: boolean })?.json ?? false;

    clearScope(root);

    if (jsonMode) {
      output({ scope: [] }, { json: true, quiet: false });
    } else {
      success('Scope cleared');
    }
  });

// ── specwork scope check ───────────────────────────────────────────────────────

const checkCmd = new Command('check')
  .description('Check if a file path is within the current scope (exit 0 = in scope, exit 2 = out)')
  .argument('<file>', 'File path to check')
  .action((file: string, _opts, cmd: Command) => {
    const root = findSpecworkRoot();
    const jsonMode = (cmd.parent?.parent?.opts() as { json?: boolean })?.json ?? false;

    const inScope = checkScope(root, file);
    const scope = getScope(root);

    if (jsonMode) {
      output({ file, in_scope: inScope, scope }, { json: true, quiet: false });
    } else {
      if (inScope) {
        success(`✓ ${file} is in scope`);
      } else {
        process.stderr.write(`✗ ${file} is outside scope. Allowed: ${scope.join(', ')}\n`);
      }
    }

    if (!inScope) {
      process.exit(ExitCode.BLOCKED);
    }
  });

// ── specwork scope (parent command) ───────────────────────────────────────────

export function makeScopeCommand(): Command {
  const scopeCmd = new Command('scope')
    .description('Manage write scope for the current node');

  scopeCmd.addCommand(setCmd);
  scopeCmd.addCommand(clearCmd);
  scopeCmd.addCommand(checkCmd);

  return scopeCmd;
}
