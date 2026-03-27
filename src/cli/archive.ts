import { Command } from 'commander';
import { findSpecworkRoot } from '../utils/paths.js';
import { output } from '../utils/output.js';
import { success, info, warn } from '../utils/logger.js';
import { archiveChange, checkCompletion } from '../core/archive.js';

export function makeArchiveCommand(): Command {
  return new Command('archive')
    .description('Archive a completed change — moves to archive, generates summary, promotes specs')
    .argument('<change>', 'Change name to archive')
    .option('--force', 'Archive even if nodes are incomplete', false)
    .action((change: string, opts: { force: boolean }, cmd: Command) => {
      const root = findSpecworkRoot();
      const jsonMode = (cmd.parent?.opts() as { json?: boolean })?.json ?? false;
      const quietMode = (cmd.parent?.opts() as { quiet?: boolean })?.quiet ?? false;

      const result = archiveChange(root, change, { force: opts.force });

      if (jsonMode) {
        output({
          change: result.change,
          archivePath: result.archivePath,
          specsPromoted: result.specsPromoted,
          nodesCleaned: result.nodesCleaned,
          forced: result.forced,
        }, { json: true, quiet: quietMode });
        return;
      }

      if (result.forced) {
        warn('Archived with --force (some nodes may be incomplete)');
      }

      success(`Archived: ${result.change}`);
      info('');
      info(`  Archive: ${result.archivePath}`);
      if (result.specsPromoted.length > 0) {
        info(`  Specs promoted: ${result.specsPromoted.join(', ')}`);
      } else {
        info('  Specs promoted: none');
      }
      if (result.nodesCleaned) {
        info('  Graph/nodes cleaned up');
      }
    });
}
