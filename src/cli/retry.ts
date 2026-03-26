import { Command } from 'commander';
import {
  findForemanRoot,
  graphPath,
  statePath,
} from '../utils/paths.js';
import { readYaml, writeYaml } from '../io/filesystem.js';
import { getNode } from '../core/graph-walker.js';
import { output } from '../utils/output.js';
import { success, info } from '../utils/logger.js';
import {
  ForemanError,
  NodeNotFoundError,
  ChangeNotFoundError,
} from '../utils/errors.js';
import { ExitCode } from '../types/index.js';
import type { Graph } from '../types/graph.js';
import type { WorkflowState } from '../types/state.js';
import fs from 'node:fs';

// ── foreman retry ──────────────────────────────────────────────────────────
//   Usage: foreman retry <change>/<node>

export function makeRetryCommand(): Command {
  return new Command('retry')
    .description('Reset a failed or escalated node back to pending for re-execution')
    .argument('<change/node>', 'Change and node in <change>/<node> format')
    .option('--clear-retries', 'Reset retry counter to 0', false)
    .action((changeNode: string, opts: { clearRetries: boolean }, cmd: Command) => {
      const root = findForemanRoot();
      const jsonMode = (cmd.parent?.opts() as { json?: boolean })?.json ?? false;

      // Parse <change>/<node>
      const slash = changeNode.indexOf('/');
      if (slash === -1) {
        throw new ForemanError(
          `Invalid argument "${changeNode}": expected <change>/<node> format`,
          ExitCode.ERROR
        );
      }
      const change = changeNode.slice(0, slash);
      const nodeId = changeNode.slice(slash + 1);

      const gp = graphPath(root, change);
      if (!fs.existsSync(gp)) throw new ChangeNotFoundError(change);

      const graph = readYaml<Graph>(gp);
      const state = readYaml<WorkflowState>(statePath(root, change));

      const node = getNode(graph, nodeId);
      if (!node) throw new NodeNotFoundError(nodeId);

      const ns = state.nodes[nodeId];
      const currentStatus = ns?.status ?? 'pending';

      if (currentStatus !== 'failed' && currentStatus !== 'escalated') {
        throw new ForemanError(
          `Cannot retry node "${nodeId}": status is "${currentStatus}" (must be failed or escalated)`,
          ExitCode.ERROR
        );
      }

      const updatedNode = {
        ...ns!,
        status: 'pending' as const,
        error: null,
        started_at: null,
        completed_at: null,
        retries: opts.clearRetries ? 0 : (ns?.retries ?? 0),
      };

      const updatedState: WorkflowState = {
        ...state,
        status: 'active',
        updated_at: new Date().toISOString(),
        nodes: { ...state.nodes, [nodeId]: updatedNode },
      };

      writeYaml(statePath(root, change), updatedState);

      const result = {
        change,
        node: nodeId,
        previous_status: currentStatus,
        status: 'pending',
        retries: updatedNode.retries,
      };

      if (jsonMode) {
        output(result, { json: true, quiet: false });
      } else {
        success(`Node reset to pending: ${change}/${nodeId}`);
        info(`  Previous status: ${currentStatus}`);
        info(`  Retry count: ${updatedNode.retries}${opts.clearRetries ? ' (cleared)' : ''}`);
        info(`  Run with: foreman node start ${change} ${nodeId}`);
      }
    });
}
