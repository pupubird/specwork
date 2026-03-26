import { Command } from 'commander';
import {
  findForemanRoot,
  graphPath,
  statePath,
  nodeDir,
} from '../utils/paths.js';
import { readYaml, readMarkdown } from '../io/filesystem.js';
import { topologicalSort } from '../core/graph-walker.js';
import { output } from '../utils/output.js';
import { info, warn } from '../utils/logger.js';
import { ChangeNotFoundError } from '../utils/errors.js';
import type { Graph } from '../types/graph.js';
import type { WorkflowState } from '../types/state.js';
import path from 'node:path';
import fs from 'node:fs';

// ── foreman log ────────────────────────────────────────────────────────────
//   If node specified: show that node's L2.md
//   If no node: show all L0 headlines in topo order

export function makeLogCommand(): Command {
  return new Command('log')
    .description('Show node L2 detail or all L0 headlines in topo order')
    .argument('<change>', 'Change name')
    .argument('[node]', 'Node ID (omit for all L0 headlines)')
    .action((change: string, nodeId: string | undefined, _opts, cmd: Command) => {
      const root = findForemanRoot();
      const jsonMode = (cmd.parent?.opts() as { json?: boolean })?.json ?? false;

      const gp = graphPath(root, change);
      if (!fs.existsSync(gp)) throw new ChangeNotFoundError(change);

      const graph = readYaml<Graph>(gp);
      const state = readYaml<WorkflowState>(statePath(root, change));

      if (nodeId) {
        // ── single node: show L2.md ─────────────────────────────────────
        const nDir = nodeDir(root, change, nodeId);
        const l2Path = path.join(nDir, 'L2.md');

        if (!fs.existsSync(l2Path)) {
          const l0Path = path.join(nDir, 'L0.md');
          const fallback = fs.existsSync(l0Path) ? readMarkdown(l0Path) : null;

          if (jsonMode) {
            output({ change, node: nodeId, l2: null, l0: fallback }, { json: true, quiet: false });
          } else {
            warn(`No L2.md found for node "${nodeId}"`);
            if (fallback) {
              info(`L0: ${fallback.trim()}`);
            }
          }
          return;
        }

        const l2 = readMarkdown(l2Path);

        if (jsonMode) {
          output({ change, node: nodeId, l2 }, { json: true, quiet: false });
          return;
        }

        process.stdout.write(l2);
        if (!l2.endsWith('\n')) process.stdout.write('\n');
        return;
      }

      // ── all nodes: L0 headlines in topo order ─────────────────────────
      const sorted = (() => {
        try { return topologicalSort(graph); }
        catch { return graph.nodes.map(n => n.id); }
      })();

      const entries = sorted.map(id => {
        const ns = state.nodes[id];
        const nDir = nodeDir(root, change, id);
        const l0File = path.join(nDir, 'L0.md');
        const l0 = ns?.l0 ?? (fs.existsSync(l0File) ? readMarkdown(l0File).trim() : null);
        return { node: id, status: ns?.status ?? 'pending', l0 };
      });

      if (jsonMode) {
        output({ change, nodes: entries }, { json: true, quiet: false });
        return;
      }

      for (const entry of entries) {
        const icon = entry.status === 'complete' ? '✓' :
                     entry.status === 'failed' ? '✗' :
                     entry.status === 'in_progress' ? '▶' :
                     entry.status === 'skipped' ? '–' : '○';
        const headline = entry.l0 ? ` — ${entry.l0}` : '';
        info(`${icon} ${entry.node}${headline}`);
      }
    });
}
