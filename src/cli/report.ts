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
import { info } from '../utils/logger.js';
import { ChangeNotFoundError } from '../utils/errors.js';
import type { Graph } from '../types/graph.js';
import type { WorkflowState } from '../types/state.js';
import path from 'node:path';
import fs from 'node:fs';

// ── foreman report ─────────────────────────────────────────────────────────
//   Full markdown report: all nodes with L0/L1 summaries, verification results,
//   and metrics (completion rate, retry count, expand count).

export function makeReportCommand(): Command {
  return new Command('report')
    .description('Full markdown report for a change: L0/L1 summaries, verification, metrics')
    .argument('<change>', 'Change name')
    .action((change: string, _opts, cmd: Command) => {
      const root = findForemanRoot();
      const jsonMode = (cmd.parent?.opts() as { json?: boolean })?.json ?? false;

      const gp = graphPath(root, change);
      if (!fs.existsSync(gp)) throw new ChangeNotFoundError(change);

      const graph = readYaml<Graph>(gp);
      const state = readYaml<WorkflowState>(statePath(root, change));

      // Sorted node order
      const sorted = (() => {
        try { return topologicalSort(graph); }
        catch { return graph.nodes.map(n => n.id); }
      })();

      // ── per-node details ──────────────────────────────────────────────
      const nodeReports = sorted.map(nodeId => {
        const node = graph.nodes.find(n => n.id === nodeId)!;
        const ns = state.nodes[nodeId];
        const nDir = nodeDir(root, change, nodeId);

        const readArtifact = (file: string): string | null => {
          const p = path.join(nDir, file);
          return fs.existsSync(p) ? readMarkdown(p) : null;
        };

        return {
          id: nodeId,
          type: node.type,
          agent: node.agent ?? null,
          status: ns?.status ?? 'pending',
          retries: ns?.retries ?? 0,
          error: ns?.error ?? null,
          started_at: ns?.started_at ?? null,
          completed_at: ns?.completed_at ?? null,
          l0: ns?.l0 ?? readArtifact('L0.md'),
          l1: readArtifact('L1.md'),
          l2: readArtifact('L2.md'),
          verify: readArtifact('verify.md'),
        };
      });

      // ── metrics ───────────────────────────────────────────────────────
      const total = graph.nodes.length;
      const complete = nodeReports.filter(n => n.status === 'complete').length;
      const failed = nodeReports.filter(n => n.status === 'failed' || n.status === 'escalated').length;
      const skipped = nodeReports.filter(n => n.status === 'skipped').length;
      const totalRetries = nodeReports.reduce((sum, n) => sum + n.retries, 0);
      const completionRate = total > 0 ? Math.round((complete / total) * 100) : 0;

      if (jsonMode) {
        output({
          change,
          status: state.status,
          metrics: { total, complete, failed, skipped, total_retries: totalRetries, completion_rate: completionRate },
          nodes: nodeReports,
        }, { json: true, quiet: false });
        return;
      }

      // ── markdown report ───────────────────────────────────────────────
      const lines: string[] = [];

      lines.push(`# Foreman Report: ${change}`);
      lines.push('');
      lines.push(`**Status:** ${state.status.toUpperCase()}  `);
      lines.push(`**Started:** ${state.started_at}  `);
      lines.push(`**Updated:** ${state.updated_at}`);
      lines.push('');

      lines.push('## Metrics');
      lines.push('');
      lines.push(`| Metric | Value |`);
      lines.push(`|--------|-------|`);
      lines.push(`| Completion rate | ${completionRate}% (${complete}/${total}) |`);
      lines.push(`| Failed / Escalated | ${failed} |`);
      lines.push(`| Skipped | ${skipped} |`);
      lines.push(`| Total retries | ${totalRetries} |`);
      lines.push('');

      lines.push('## Nodes');
      lines.push('');

      for (const n of nodeReports) {
        lines.push(`### ${n.id} (${n.status})`);
        lines.push('');
        if (n.l0) {
          lines.push(`**L0:** ${n.l0.trim()}`);
          lines.push('');
        }
        if (n.l1) {
          lines.push('**L1 Summary:**');
          lines.push('');
          lines.push(n.l1.trim());
          lines.push('');
        }
        if (n.verify) {
          lines.push('**Verification:**');
          lines.push('');
          lines.push(n.verify.trim());
          lines.push('');
        }
        if (n.error) {
          lines.push(`**Error:** ${n.error}`);
          lines.push('');
        }
        if (n.retries > 0) {
          lines.push(`**Retries:** ${n.retries}`);
          lines.push('');
        }
      }

      process.stdout.write(lines.join('\n') + '\n');
    });
}
