import { Command } from 'commander';
import { findSpecworkRoot, graphPath, statePath } from '../utils/paths.js';
import { readYaml } from '../io/filesystem.js';
import { output, table } from '../utils/output.js';
import { info } from '../utils/logger.js';
import { ChangeNotFoundError } from '../utils/errors.js';
import type { Graph } from '../types/graph.js';
import type { WorkflowState, NodeStatus } from '../types/state.js';
import path from 'node:path';
import fs from 'node:fs';

// ── status symbols ─────────────────────────────────────────────────────────

const STATUS_ICON: Record<NodeStatus, string> = {
  pending:     '○',
  in_progress: '▶',
  complete:    '✓',
  failed:      '✗',
  escalated:   '!',
  rejected:    '✗',
  skipped:     '–',
};

// ── specwork status ─────────────────────────────────────────────────────────

export function makeStatusCommand(): Command {
  return new Command('status')
    .description('Show workflow status — all changes or a specific change')
    .argument('[change]', 'Change name (omit to list all changes)')
    .action((change: string | undefined, _opts, cmd: Command) => {
      const root = findSpecworkRoot();
      const jsonMode = (cmd.parent?.opts() as { json?: boolean })?.json ?? false;

      if (!change) {
        // ── list all changes ──────────────────────────────────────────
        const graphDir = path.join(root, '.specwork', 'graph');
        if (!fs.existsSync(graphDir)) {
          if (jsonMode) {
            output({ changes: [] }, { json: true, quiet: false });
          } else {
            info('No changes found.');
          }
          return;
        }

        const changes = fs.readdirSync(graphDir, { withFileTypes: true })
          .filter(e => e.isDirectory())
          .map(e => e.name);

        const rows = changes.map(c => {
          const sp = statePath(root, c);
          if (!fs.existsSync(sp)) return { change: c, status: 'no-state', progress: '?' };
          const state = readYaml<WorkflowState>(sp);
          const gp = graphPath(root, c);
          if (!fs.existsSync(gp)) return { change: c, status: state.status, progress: '?' };
          const graph = readYaml<Graph>(gp);
          const total = graph.nodes.length;
          const done = graph.nodes.filter(n => state.nodes[n.id]?.status === 'complete').length;
          return { change: c, status: state.status, progress: `${done}/${total}` };
        });

        if (jsonMode) {
          output({ changes: rows }, { json: true, quiet: false });
          return;
        }

        table(
          ['Change', 'Status', 'Progress'],
          rows.map(r => [r.change, r.status, r.progress])
        );
        return;
      }

      // ── single change detail ──────────────────────────────────────────
      const gp = graphPath(root, change);
      if (!fs.existsSync(gp)) {
        const graphDir = path.join(root, '.specwork', 'graph');
        const available = fs.existsSync(graphDir)
          ? fs.readdirSync(graphDir, { withFileTypes: true })
              .filter(e => e.isDirectory())
              .map(e => e.name)
          : [];
        throw new ChangeNotFoundError(change, available);
      }

      const graph = readYaml<Graph>(gp);
      const state = readYaml<WorkflowState>(statePath(root, change));

      const total = graph.nodes.length;
      const complete = graph.nodes.filter(n => state.nodes[n.id]?.status === 'complete').length;
      const failed = graph.nodes.filter(n => {
        const s = state.nodes[n.id]?.status;
        return s === 'failed' || s === 'escalated';
      }).length;

      const nodes = graph.nodes.map(n => {
        const ns = state.nodes[n.id];
        return {
          id: n.id,
          type: n.type,
          agent: n.agent ?? null,
          status: ns?.status ?? 'pending',
          deps: n.deps,
          retries: ns?.retries ?? 0,
          l0: ns?.l0 ?? null,
          error: ns?.error ?? null,
        };
      });

      if (jsonMode) {
        output({
          change,
          status: state.status,
          progress: { complete, total, failed },
          started_at: state.started_at,
          updated_at: state.updated_at,
          nodes,
        }, { json: true, quiet: false });
        return;
      }

      process.stdout.write(`Change: ${change}  [${state.status.toUpperCase()}]  ${complete}/${total} complete${failed > 0 ? `  ${failed} failed` : ''}\n`);
      process.stdout.write(`Started: ${state.started_at}  Updated: ${state.updated_at}\n`);
      process.stdout.write('\n');

      table(
        ['Node', 'Type', 'Agent', 'Status', 'Deps', 'Retries', 'L0'],
        nodes.map(n => [
          n.id,
          n.type,
          n.agent ?? '',
          `${STATUS_ICON[n.status as NodeStatus]} ${n.status}`,
          n.deps.join(', ') || '(none)',
          String(n.retries),
          n.l0 ?? '',
        ])
      );
    });
}
