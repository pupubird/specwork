import { Command } from 'commander';
import {
  findForemanRoot,
  graphPath,
  statePath,
  nodeDir,
  currentNodePath,
  lockPath,
} from '../utils/paths.js';
import { readYaml, writeYaml, writeMarkdown, ensureDir } from '../io/filesystem.js';
import { commit } from '../io/git.js';
import {
  transitionNode,
  incrementRetry,
  skipDependents,
  getChangeStatus,
} from '../core/state-machine.js';
import { getNode } from '../core/graph-walker.js';
import { setScope, clearScope } from '../core/scope-manager.js';
import { releaseLock } from '../core/lock-manager.js';
import { output, table } from '../utils/output.js';
import { info, success, error as logError, warn } from '../utils/logger.js';
import {
  ForemanError,
  NodeNotFoundError,
  ChangeNotFoundError,
} from '../utils/errors.js';
import { ExitCode } from '../types/index.js';
import type { Graph } from '../types/graph.js';
import type { WorkflowState } from '../types/state.js';
import fs from 'node:fs';

// ── helpers ───────────────────────────────────────────────────────────────────

function loadGraphAndState(
  root: string,
  change: string
): { graph: Graph; state: WorkflowState } {
  const gp = graphPath(root, change);
  const sp = statePath(root, change);

  if (!fs.existsSync(gp)) {
    throw new ChangeNotFoundError(change);
  }

  const graph = readYaml<Graph>(gp);
  const state = readYaml<WorkflowState>(sp);
  return { graph, state };
}

function saveState(root: string, change: string, state: WorkflowState): void {
  writeYaml(statePath(root, change), state);
}

function clearNodeTracking(root: string): void {
  const cnp = currentNodePath(root);
  if (fs.existsSync(cnp)) fs.unlinkSync(cnp);
}

// ── foreman node start ────────────────────────────────────────────────────────

const startCmd = new Command('start')
  .description('Mark a node as in_progress and set scope')
  .argument('<change>', 'Change name')
  .argument('<node>', 'Node ID')
  .action(async (change: string, nodeId: string, _opts, cmd: Command) => {
    const root = findForemanRoot();
    const jsonMode = (cmd.parent?.parent?.opts() as { json?: boolean })?.json ?? false;

    const { graph, state } = loadGraphAndState(root, change);

    const node = getNode(graph, nodeId);
    if (!node) throw new NodeNotFoundError(nodeId);

    // Validate all deps are complete
    const blockedDeps = node.deps.filter(depId => {
      const depState = state.nodes[depId];
      return depState?.status !== 'complete';
    });
    if (blockedDeps.length > 0) {
      throw new ForemanError(
        `Cannot start "${nodeId}": dependencies not complete: ${blockedDeps.join(', ')}`,
        ExitCode.BLOCKED
      );
    }

    // Transition to in_progress
    const updated = transitionNode(state, nodeId, 'in_progress');

    // Write scope
    if (node.scope.length > 0) {
      setScope(root, node.scope);
    }

    // Write .current-node
    const cnp = currentNodePath(root);
    fs.writeFileSync(cnp, `${change}/${nodeId}`, 'utf8');

    // Ensure node artifacts dir exists
    ensureDir(nodeDir(root, change, nodeId));

    saveState(root, change, updated);

    const nodeInfo = {
      change,
      node: nodeId,
      type: node.type,
      status: 'in_progress',
      scope: node.scope,
      deps: node.deps,
    };

    if (jsonMode) {
      output(nodeInfo, { json: true, quiet: false });
    } else {
      success(`▶ Node started: ${change}/${nodeId}`);
      table(
        ['Field', 'Value'],
        [
          ['Change', change],
          ['Node', nodeId],
          ['Type', node.type],
          ['Scope', node.scope.join(', ') || '(none)'],
          ['Dependencies', node.deps.join(', ') || '(none)'],
        ]
      );
    }
  });

// ── foreman node complete ─────────────────────────────────────────────────────

const completeCmd = new Command('complete')
  .description('Mark a node as complete, write L0, commit, clear scope')
  .argument('<change>', 'Change name')
  .argument('<node>', 'Node ID')
  .option('--l0 <summary>', 'L0 headline summary for this node')
  .option('--no-commit', 'Skip git commit')
  .action(async (change: string, nodeId: string, opts: { l0?: string; commit: boolean }, cmd: Command) => {
    const root = findForemanRoot();
    const jsonMode = (cmd.parent?.parent?.opts() as { json?: boolean })?.json ?? false;

    const { graph, state } = loadGraphAndState(root, change);

    const node = getNode(graph, nodeId);
    if (!node) throw new NodeNotFoundError(nodeId);

    // Transition to complete
    const l0Summary = opts.l0 ?? null;
    const updated = transitionNode(state, nodeId, 'complete', {
      l0: l0Summary ?? undefined,
    });

    // Write L0 artifact if provided
    if (l0Summary) {
      const nDir = nodeDir(root, change, nodeId);
      ensureDir(nDir);
      writeMarkdown(`${nDir}/L0.md`, `- ${nodeId}: ${l0Summary}\n`);
    }

    // Clear scope and current-node tracking
    clearScope(root);
    clearNodeTracking(root);

    // Update change status
    const changeStatus = getChangeStatus(updated);
    const finalState = { ...updated, status: changeStatus };

    saveState(root, change, finalState);

    // Git commit
    if (opts.commit !== false) {
      try {
        commit(`foreman(${change}): ${nodeId} complete`);
      } catch (err) {
        warn(`Git commit skipped: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const result = {
      change,
      node: nodeId,
      status: 'complete',
      l0: l0Summary,
      change_status: changeStatus,
    };

    if (jsonMode) {
      output(result, { json: true, quiet: false });
    } else {
      success(`✓ Node complete: ${change}/${nodeId}`);
      if (l0Summary) info(`  L0: ${l0Summary}`);
      info(`  Change status: ${changeStatus}`);
    }
  });

// ── foreman node fail ─────────────────────────────────────────────────────────

const failCmd = new Command('fail')
  .description('Mark a node as failed (retries if budget remains, escalates if exhausted)')
  .argument('<change>', 'Change name')
  .argument('<node>', 'Node ID')
  .option('--reason <msg>', 'Failure reason')
  .action(async (change: string, nodeId: string, opts: { reason?: string }, cmd: Command) => {
    const root = findForemanRoot();
    const jsonMode = (cmd.parent?.parent?.opts() as { json?: boolean })?.json ?? false;

    const { graph, state } = loadGraphAndState(root, change);

    const node = getNode(graph, nodeId);
    if (!node) throw new NodeNotFoundError(nodeId);

    const maxRetries = node.retry ?? 2;
    const { state: withRetry, exhausted } = incrementRetry(state, nodeId, maxRetries);

    let updated: WorkflowState;
    let finalStatus: string;

    if (exhausted) {
      // Escalate and cascade-skip dependents
      updated = transitionNode(withRetry, nodeId, 'escalated', { error: opts.reason });
      updated = skipDependents(updated, graph, nodeId);
      finalStatus = 'escalated';
      logError(`✗ Node escalated (retries exhausted): ${change}/${nodeId}`);
    } else {
      updated = transitionNode(withRetry, nodeId, 'failed', { error: opts.reason });
      finalStatus = 'failed';
      const retries = updated.nodes[nodeId]?.retries ?? 0;
      warn(`⚠ Node failed (retry ${retries}/${maxRetries}): ${change}/${nodeId}`);
    }

    // Clear scope and current-node tracking
    clearScope(root);
    clearNodeTracking(root);

    const changeStatus = getChangeStatus(updated);
    const finalState = { ...updated, status: changeStatus };
    saveState(root, change, finalState);

    const result = {
      change,
      node: nodeId,
      status: finalStatus,
      reason: opts.reason ?? null,
      retries: updated.nodes[nodeId]?.retries ?? 0,
      max_retries: maxRetries,
      change_status: changeStatus,
    };

    if (jsonMode) {
      output(result, { json: true, quiet: false });
    } else if (!exhausted) {
      info(`  Reason: ${opts.reason ?? '(none)'}`);
      info(`  Retries: ${result.retries}/${maxRetries} — retry with: foreman node start ${change} ${nodeId}`);
    }
  });

// ── foreman node escalate ─────────────────────────────────────────────────────

const escalateCmd = new Command('escalate')
  .description('Mark a node as escalated and skip all dependents')
  .argument('<change>', 'Change name')
  .argument('<node>', 'Node ID')
  .option('--reason <msg>', 'Escalation reason')
  .action(async (change: string, nodeId: string, opts: { reason?: string }, cmd: Command) => {
    const root = findForemanRoot();
    const jsonMode = (cmd.parent?.parent?.opts() as { json?: boolean })?.json ?? false;

    const { graph, state } = loadGraphAndState(root, change);

    const node = getNode(graph, nodeId);
    if (!node) throw new NodeNotFoundError(nodeId);

    let updated = transitionNode(state, nodeId, 'escalated', { error: opts.reason });
    updated = skipDependents(updated, graph, nodeId);

    clearScope(root);
    clearNodeTracking(root);

    const changeStatus = getChangeStatus(updated);
    const finalState = { ...updated, status: changeStatus };
    saveState(root, change, finalState);

    const skipped = graph.nodes
      .filter(n => updated.nodes[n.id]?.status === 'skipped')
      .map(n => n.id);

    const result = {
      change,
      node: nodeId,
      status: 'escalated',
      reason: opts.reason ?? null,
      skipped_nodes: skipped,
      change_status: changeStatus,
    };

    if (jsonMode) {
      output(result, { json: true, quiet: false });
    } else {
      logError(`✗ Node escalated: ${change}/${nodeId}`);
      if (opts.reason) info(`  Reason: ${opts.reason}`);
      if (skipped.length > 0) warn(`  Skipped dependents: ${skipped.join(', ')}`);
    }
  });

// ── foreman node (parent command) ─────────────────────────────────────────────

export function makeNodeCommand(): Command {
  const nodeCmd = new Command('node')
    .description('Manage node lifecycle within a workflow');

  nodeCmd.addCommand(startCmd);
  nodeCmd.addCommand(completeCmd);
  nodeCmd.addCommand(failCmd);
  nodeCmd.addCommand(escalateCmd);

  return nodeCmd;
}
