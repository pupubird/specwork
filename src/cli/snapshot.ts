import { Command } from 'commander';
import { findForemanRoot, snapshotPath } from '../utils/paths.js';
import { writeSnapshot } from '../core/snapshot-generator.js';
import { success, info } from '../utils/logger.js';

export function makeSnapshotCommand(): Command {
  const snapshot = new Command('snapshot')
    .description('Generate an environment snapshot of the current project')
    .action(() => {
      const root = findForemanRoot();
      info('Scanning project...');
      writeSnapshot(root);
      const outPath = snapshotPath(root);
      success(`Snapshot written to ${outPath}`);
    });

  return snapshot;
}
