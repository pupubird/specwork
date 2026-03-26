import { Command } from 'commander';
import { findForemanRoot } from '../utils/paths.js';
import {
  assembleContext,
  renderContext,
  getL0All,
  getL1,
  getL2,
} from '../core/context-assembler.js';
import { output } from '../utils/output.js';
import { ForemanError } from '../utils/errors.js';
import { ExitCode } from '../types/index.js';

export function makeContextCommand(): Command {
  const context = new Command('context')
    .description('Manage and inspect Foreman context bundles');

  context
    .command('assemble <change> <node>')
    .description('Assemble and render full context bundle for a node')
    .action((change: string, node: string) => {
      const root = findForemanRoot();
      const bundle = assembleContext(root, change, node);
      const rendered = renderContext(bundle);
      output(rendered, { json: false, quiet: false });
    });

  context
    .command('expand <change> <node> <target>')
    .description('Output L2 (full diff + verify) for a target node')
    .action((change: string, _node: string, target: string) => {
      const root = findForemanRoot();
      const l2 = getL2(root, change, target);
      if (!l2) {
        throw new ForemanError(
          `No L2 context found for node "${target}" in change "${change}"`,
          ExitCode.ERROR
        );
      }
      output(l2, { json: false, quiet: false });
    });

  context
    .command('l0 <change>')
    .description('Output all L0 headlines for a change')
    .option('--json', 'Output as JSON')
    .action((change: string, opts: { json?: boolean }) => {
      const root = findForemanRoot();
      const entries = getL0All(root, change);
      if (opts.json) {
        output(entries, { json: true, quiet: false });
      } else {
        if (entries.length === 0) {
          output('(no completed nodes)', { json: false, quiet: false });
        } else {
          const lines = entries.map(e => `- **${e.nodeId}**: ${e.headline}`).join('\n');
          output(lines, { json: false, quiet: false });
        }
      }
    });

  context
    .command('l1 <change> <node>')
    .description('Output L1 summary for a specific node')
    .action((change: string, node: string) => {
      const root = findForemanRoot();
      const l1 = getL1(root, change, node);
      if (!l1) {
        throw new ForemanError(
          `No L1 context found for node "${node}" in change "${change}"`,
          ExitCode.ERROR
        );
      }
      output(l1, { json: false, quiet: false });
    });

  return context;
}
