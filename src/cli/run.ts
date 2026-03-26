import { Command } from 'commander';
import {
  findForemanRoot,
  graphPath,
  statePath,
  lockPath,
} from '../utils/paths.js';
import { readYaml, writeYaml } from '../io/filesystem.js';
import {
  getReadyNodes,
  getNode,
  topologicalSort,
  getBlockedNodes,
} from '../core/graph-walker.js';
import { acquireLock, checkLock, releaseLock, forceLock } from '../core/lock-manager.js';
import { getChangeStatus, isTerminal } from '../core/state-machine.js';
import { output, table } from '../utils/output.js';
import { info, success, warn } from '../utils/logger.js';
import {
  ForemanError,
  NodeNotFoundError,
  ChangeNotFoundError,
  LockError,
} from '../utils/errors.js';
import { ExitCode } from '../types/index.js';
import type { Graph, GraphNode } from '../types/graph.js';
import type { WorkflowState } from '../types/state.js';
import fs from 'node:fs';

// ── foreman run ────────────────────────────────────────────────────────────

export function makeRunCommand(): Command {
  return new Command('run')
    .description('Find ready nodes and output execution plan for the change')
    .argument('<change>', 'Change name')
    .option('--node <id>', 'Only process a specific node')
    .option('--from <id>', 'Skip all nodes before this node in topo order')
    .option('--dry-run', 'Print execution plan without acquiring lock', false)
    .option('--force', 'Override an existing stale lock', false)
    .option('--unlock', 'Release the change lock and exit', false)
    .action((change: string, opts: { node?: string; from?: string; dryRun: boolean; force: boolean; unlock: boolean }, cmd: Command) => {
      const root = findForemanRoot();
      const jsonMode = (cmd.parent?.opts() as { json?: boolean })?.json ?? false;

      const gp = graphPath(root, change);
      if (!fs.existsSync(gp)) throw new ChangeNotFoundError(change);

      const lp = lockPath(root, change);

      // ── unlock mode ──────────────────────────────────────────────────
      if (opts.unlock) {
        releaseLock(lp);
        if (jsonMode) {
          output({ change, locked: false }, { json: true, quiet: false });
        } else {
          success(`Lock released for change: ${change}`);
        }
        return;
      }

      // ── load graph + state ───────────────────────────────────────────
      const graph = readYaml<Graph>(gp);
      let state = readYaml<WorkflowState>(statePath(root, change));

      // ── --from: skip nodes before the given node in topo order ────────
      if (opts.from) {
        const fromNode = getNode(graph, opts.from);
        if (!fromNode) throw new NodeNotFoundError(opts.from);

        const sorted = topologicalSort(graph);
        const fromIdx = sorted.indexOf(opts.from);
        if (fromIdx === -1) throw new NodeNotFoundError(opts.from);

        const toSkip = sorted.slice(0, fromIdx);
        const ts = new Date().toISOString();
        for (const nodeId of toSkip) {
          const ns = state.nodes[nodeId];
          if (ns?.status === 'pending') {
            state = {
              ...state,
              updated_at: ts,
              nodes: {
                ...state.nodes,
                [nodeId]: { ...ns, status: 'skipped', completed_at: ts, error: 'Skipped via --from flag' },
              },
            };
          }
        }
        writeYaml(statePath(root, change), state);
      }

      // ── progress metrics ─────────────────────────────────────────────
      const allNodes = graph.nodes;
      const total = allNodes.length;
      const complete = allNodes.filter(n => state.nodes[n.id]?.status === 'complete').length;
      const failed = allNodes.filter(n => {
        const s = state.nodes[n.id]?.status;
        return s === 'failed' || s === 'escalated';
      }).length;
      const inProgress = allNodes.filter(n => state.nodes[n.id]?.status === 'in_progress').length;

      const progress = { complete, total, failed, in_progress: inProgress };

      // ── determine ready nodes ────────────────────────────────────────
      let readyNodes: GraphNode[];

      if (opts.node) {
        const node = getNode(graph, opts.node);
        if (!node) throw new NodeNotFoundError(opts.node);

        const ns = state.nodes[opts.node];
        const status = ns?.status ?? 'pending';
        if (status !== 'pending' && status !== 'failed' && status !== 'escalated') {
          if (jsonMode) {
            output({ ready: [], progress, reason: `node_not_runnable:${status}` }, { json: true, quiet: false });
          } else {
            warn(`Node "${opts.node}" is not runnable (status: ${status})`);
          }
          process.exit(ExitCode.BLOCKED);
        }

        const blockedDeps = node.deps.filter(d => state.nodes[d]?.status !== 'complete');
        if (blockedDeps.length > 0) {
          if (jsonMode) {
            output({ ready: [], progress, reason: 'blocked', blocked_by: blockedDeps }, { json: true, quiet: false });
          } else {
            warn(`Node "${opts.node}" blocked by: ${blockedDeps.join(', ')}`);
          }
          process.exit(ExitCode.BLOCKED);
        }

        readyNodes = [node];
      } else {
        readyNodes = getReadyNodes(graph, state);
      }

      // ── nothing ready — classify why ─────────────────────────────────
      if (readyNodes.length === 0) {
        const allTerminal = allNodes.every(n => isTerminal(state.nodes[n.id]?.status ?? 'pending'));

        if (allTerminal) {
          // Update change status to complete and persist
          const changeStatus = getChangeStatus(state);
          const finalState: WorkflowState = { ...state, status: changeStatus, updated_at: new Date().toISOString() };
          writeYaml(statePath(root, change), finalState);

          if (jsonMode) {
            output({ ready: [], progress, status: changeStatus, reason: 'complete' }, { json: true, quiet: false });
          } else {
            success(`Change "${change}" is complete (${changeStatus}).`);
          }
          return;
        }

        if (inProgress > 0) {
          if (jsonMode) {
            output({ ready: [], progress, reason: 'waiting', in_progress: inProgress }, { json: true, quiet: false });
          } else {
            info(`Waiting — ${inProgress} node(s) still in progress.`);
          }
          return;
        }

        // Blocked by failed deps
        const blocked = getBlockedNodes(graph, state);
        if (jsonMode) {
          output({
            ready: [],
            progress,
            reason: 'blocked',
            blocked_nodes: blocked.map(n => n.id),
          }, { json: true, quiet: false });
        } else {
          warn(`Blocked — no ready nodes. Blocked nodes: ${blocked.map(n => n.id).join(', ')}`);
        }
        process.exit(ExitCode.BLOCKED);
      }

      // ── dry-run: print plan only ─────────────────────────────────────
      if (opts.dryRun) {
        if (jsonMode) {
          output({
            dry_run: true,
            ready: readyNodes.map(n => ({ id: n.id, type: n.type, agent: n.agent ?? null, description: n.description })),
            progress,
          }, { json: true, quiet: false });
        } else {
          info(`[dry-run] Ready nodes for change "${change}":`);
          table(
            ['Node', 'Type', 'Agent', 'Description'],
            readyNodes.map(n => [n.id, n.type, n.agent ?? '', n.description])
          );
          info(`Progress: ${complete}/${total} complete, ${failed} failed`);
        }
        return;
      }

      // ── acquire lock ─────────────────────────────────────────────────
      const lockStatus = checkLock(lp);
      if (lockStatus.locked) {
        if (lockStatus.stale && opts.force) {
          forceLock(lp);
          warn(`Stale lock cleared for: ${change}`);
        } else if (lockStatus.stale) {
          throw new ForemanError(
            `Change "${change}" has a stale lock (PID ${lockStatus.info?.pid ?? '?'}). Use --force to override.`,
            ExitCode.BLOCKED
          );
        } else {
          throw new LockError(change, lockStatus.info?.pid ?? 0);
        }
      } else {
        acquireLock(lp);
      }

      // ── output ready nodes ────────────────────────────────────────────
      const readyOut = readyNodes.map(n => ({
        id: n.id,
        type: n.type,
        agent: n.agent ?? null,
        description: n.description,
        command: n.command ?? null,
        scope: n.scope,
        deps: n.deps,
        validate: n.validate,
        gate: n.gate ?? null,
        model: n.model ?? null,
        retry: n.retry ?? 2,
        worktree: n.worktree ?? false,
      }));

      releaseLock(lp);

      if (jsonMode) {
        output({ ready: readyOut, progress }, { json: true, quiet: false });
      } else {
        success(`Ready nodes for change "${change}":`);
        table(
          ['Node', 'Type', 'Agent', 'Description'],
          readyOut.map(n => [n.id, n.type, n.agent ?? '(none)', n.description])
        );
        info(`Progress: ${complete}/${total} complete`);
        info('');
        const first = readyOut[0];
        if (first) {
          info(`Next: foreman node start ${change} ${first.id}`);
        }
      }
    });
}
