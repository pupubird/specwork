import { Command } from 'commander';
import {
  findSpecworkRoot,
  graphPath,
  statePath,
  nodeDir,
  currentNodePath,
  lockPath,
  changeDir,
} from '../utils/paths.js';
import { readYaml, writeYaml, writeMarkdown, ensureDir } from '../io/filesystem.js';
import {
  transitionNode,
  incrementRetry,
  skipDependents,
  getChangeStatus,
} from '../core/state-machine.js';
import { getNode } from '../core/graph-walker.js';
import { assembleContext, renderContext } from '../core/context-assembler.js';
import { output, table } from '../utils/output.js';
import { info, success, error as logError, warn } from '../utils/logger.js';
import {
  SpecworkError,
  NodeNotFoundError,
  ChangeNotFoundError,
} from '../utils/errors.js';
import { ExitCode } from '../types/index.js';
import { buildNextAction, readChangeContext } from '../core/next-action.js';
import type { Graph } from '../types/graph.js';
import type { WorkflowState } from '../types/state.js';
import fs from 'node:fs';
import path from 'node:path';

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

// ── specwork node start ────────────────────────────────────────────────────────

const startCmd = new Command('start')
  .description('Mark a node as in_progress and set scope')
  .argument('<change>', 'Change name')
  .argument('<node>', 'Node ID')
  .action(async (change: string, nodeId: string, _opts, cmd: Command) => {
    const root = findSpecworkRoot();
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
      throw new SpecworkError(
        `Cannot start "${nodeId}": dependencies not complete: ${blockedDeps.join(', ')}`,
        ExitCode.BLOCKED
      );
    }

    // Transition to in_progress
    const updated = transitionNode(state, nodeId, 'in_progress');

    // Write .current-node
    const cnp = currentNodePath(root);
    fs.writeFileSync(cnp, `${change}/${nodeId}`, 'utf8');

    // Ensure node artifacts dir exists
    ensureDir(nodeDir(root, change, nodeId));

    saveState(root, change, updated);

    // Assemble context for the subagent
    const bundle = assembleContext(root, change, nodeId);
    const contextStr = renderContext(bundle);

    const ctx = readChangeContext(root, change);
    const next_action = buildNextAction('wave:spawn', ctx, { change, readyNodes: [nodeId] });

    const nodeInfo = {
      change,
      node: nodeId,
      type: node.type,
      status: 'in_progress',
      scope: node.scope,
      deps: node.deps,
      context: contextStr,
      next_action,
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

// ── task check-off ────────────────────────────────────────────────────────────

/**
 * When a node completes, check off its corresponding task in tasks.md.
 * Node IDs follow the pattern impl-{group}-{task} which maps to the
 * N-th checkbox in the M-th ## group in tasks.md.
 */
export function checkOffTask(root: string, change: string, nodeId: string): void {
  const tasksPath = path.join(changeDir(root, change), 'tasks.md');
  if (!fs.existsSync(tasksPath)) return;

  const content = fs.readFileSync(tasksPath, 'utf-8');
  const lines = content.split('\n');

  // Convention lines: write-tests and integration nodes match prefixed lines
  const conventionPrefixes: Record<string, string> = {
    'write-tests': 'write-tests:',
    'integration': 'integration:',
  };
  const prefix = conventionPrefixes[nodeId];
  if (prefix) {
    for (let i = 0; i < lines.length; i++) {
      if (new RegExp(`^- \\[ \\] ${prefix}`).test(lines[i])) {
        lines[i] = lines[i].replace('- [ ]', '- [x]');
        fs.writeFileSync(tasksPath, lines.join('\n'), 'utf-8');
        return;
      }
    }
    return; // no convention line found — silently skip
  }

  // Parse node ID to get group/task indices
  const match = /^impl-(\d+)-(\d+)$/.exec(nodeId);
  if (!match) return; // non-impl nodes don't map to tasks

  const targetGroup = parseInt(match[1], 10);
  const targetTask = parseInt(match[2], 10);

  let currentGroup = 0;
  let taskInGroup = 0;

  for (let i = 0; i < lines.length; i++) {
    // Section header
    if (/^##\s+/.test(lines[i])) {
      currentGroup++;
      taskInGroup = 0;
      continue;
    }

    // Checkbox task (skip convention lines)
    if (/^- \[ \]/.test(lines[i]) && !/^- \[ \] (?:write-tests|integration):/.test(lines[i])) {
      taskInGroup++;
      if (currentGroup === targetGroup && taskInGroup === targetTask) {
        lines[i] = lines[i].replace('- [ ]', '- [x]');
        fs.writeFileSync(tasksPath, lines.join('\n'), 'utf-8');
        return;
      }
    }
  }
}

export function uncheckTask(root: string, change: string, nodeId: string): void {
  const tasksPath = path.join(changeDir(root, change), 'tasks.md');
  if (!fs.existsSync(tasksPath)) return;

  const match = /^impl-(\d+)-(\d+)$/.exec(nodeId);
  if (!match) return;

  const targetGroup = parseInt(match[1], 10);
  const targetTask = parseInt(match[2], 10);

  const content = fs.readFileSync(tasksPath, 'utf-8');
  const lines = content.split('\n');

  let currentGroup = 0;
  let taskInGroup = 0;

  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      currentGroup++;
      taskInGroup = 0;
      continue;
    }
    if (/^- \[x\]/i.test(lines[i])) {
      taskInGroup++;
      if (currentGroup === targetGroup && taskInGroup === targetTask) {
        lines[i] = lines[i].replace(/^- \[x\]/i, '- [ ]');
        fs.writeFileSync(tasksPath, lines.join('\n'), 'utf-8');
        return;
      }
    }
  }
}

// ── specwork node complete ─────────────────────────────────────────────────────

const completeCmd = new Command('complete')
  .description('Mark a node as complete and write L0')
  .argument('<change>', 'Change name')
  .argument('<node>', 'Node ID')
  .option('--l0 <summary>', 'L0 headline summary for this node')
  .action(async (change: string, nodeId: string, opts: { l0?: string }, cmd: Command) => {
    const root = findSpecworkRoot();
    const jsonMode = (cmd.parent?.parent?.opts() as { json?: boolean })?.json ?? false;

    const { graph, state } = loadGraphAndState(root, change);

    const node = getNode(graph, nodeId);
    if (!node) throw new NodeNotFoundError(nodeId);

    // Resolve L0: flag > file > null
    let l0Summary = opts.l0 ?? null;
    const nDir = nodeDir(root, change, nodeId);
    ensureDir(nDir);

    if (!l0Summary) {
      // Read from L0.md on disk when a previous tool wrote one.
      const l0FilePath = path.join(nDir, 'L0.md');
      if (fs.existsSync(l0FilePath)) {
        const raw = fs.readFileSync(l0FilePath, 'utf8').trim();
        // Strip leading "- nodeId: " prefix from legacy/generated summaries.
        const match = raw.match(/^-\s*\S+:\s*(.+)$/m);
        l0Summary = match ? match[1].trim() : raw;
      }
    }

    let updated = transitionNode(state, nodeId, 'complete', {
      l0: l0Summary ?? undefined,
    });
    updated = {
      ...updated,
      nodes: {
        ...updated.nodes,
        [nodeId]: { ...updated.nodes[nodeId], verified: true },
      },
    };

    // Write L0 artifact (always sync file with resolved value)
    if (l0Summary) {
      writeMarkdown(`${nDir}/L0.md`, `- ${nodeId}: ${l0Summary}\n`);
    }

    // Check off corresponding task in tasks.md
    checkOffTask(root, change, nodeId);

    // Clear current-node tracking
    clearNodeTracking(root);

    // Update change status
    const changeStatus = getChangeStatus(updated);
    const finalState = { ...updated, status: changeStatus };

    saveState(root, change, finalState);

    const ctx = readChangeContext(root, change);
    const next_action = buildNextAction('node:complete', ctx, { change, nodeId });

    const result = {
      change,
      node: nodeId,
      status: 'complete',
      l0: l0Summary,
      change_status: changeStatus,
      next_action,
    };

    if (jsonMode) {
      output(result, { json: true, quiet: false });
    } else {
      success(`✓ Node complete: ${change}/${nodeId}`);
      if (l0Summary) info(`  L0: ${l0Summary}`);
      info(`  Change status: ${changeStatus}`);
    }
  });

// ── specwork node fail ─────────────────────────────────────────────────────────

const failCmd = new Command('fail')
  .description('Mark a node as failed (retries if budget remains, escalates if exhausted)')
  .argument('<change>', 'Change name')
  .argument('<node>', 'Node ID')
  .option('--reason <msg>', 'Failure reason')
  .action(async (change: string, nodeId: string, opts: { reason?: string }, cmd: Command) => {
    const root = findSpecworkRoot();
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

    // Revert task checkbox on fail/escalate
    uncheckTask(root, change, nodeId);

    // Clear current-node tracking
    clearNodeTracking(root);

    const changeStatus = getChangeStatus(updated);
    const finalState = { ...updated, status: changeStatus };
    saveState(root, change, finalState);

    const ctx = readChangeContext(root, change);
    const retriesUsed = updated.nodes[nodeId]?.retries ?? 0;
    const retriesLeft = Math.max(0, maxRetries - retriesUsed);
    const next_action = buildNextAction('node:fail', ctx, { change, nodeId, retriesLeft });

    const result = {
      change,
      node: nodeId,
      status: finalStatus,
      reason: opts.reason ?? null,
      retries: retriesUsed,
      max_retries: maxRetries,
      change_status: changeStatus,
      next_action,
    };

    if (jsonMode) {
      output(result, { json: true, quiet: false });
    } else if (!exhausted) {
      info(`  Reason: ${opts.reason ?? '(none)'}`);
      info(`  Retries: ${result.retries}/${maxRetries} — retry with: specwork node start ${change} ${nodeId}`);
    }
  });

// ── specwork node escalate ─────────────────────────────────────────────────────

const escalateCmd = new Command('escalate')
  .description('Mark a node as escalated and skip all dependents')
  .argument('<change>', 'Change name')
  .argument('<node>', 'Node ID')
  .option('--reason <msg>', 'Escalation reason')
  .action(async (change: string, nodeId: string, opts: { reason?: string }, cmd: Command) => {
    const root = findSpecworkRoot();
    const jsonMode = (cmd.parent?.parent?.opts() as { json?: boolean })?.json ?? false;

    const { graph, state } = loadGraphAndState(root, change);

    const node = getNode(graph, nodeId);
    if (!node) throw new NodeNotFoundError(nodeId);

    let updated = transitionNode(state, nodeId, 'escalated', { error: opts.reason });
    updated = skipDependents(updated, graph, nodeId);

    // Revert task checkbox on escalate
    uncheckTask(root, change, nodeId);

    clearNodeTracking(root);

    const changeStatus = getChangeStatus(updated);
    const finalState = { ...updated, status: changeStatus };
    saveState(root, change, finalState);

    const skipped = graph.nodes
      .filter(n => updated.nodes[n.id]?.status === 'skipped')
      .map(n => n.id);

    const ctx = readChangeContext(root, change);
    const next_action = buildNextAction('node:escalate', ctx, { change, nodeId });

    const result = {
      change,
      node: nodeId,
      status: 'escalated',
      reason: opts.reason ?? null,
      skipped_nodes: skipped,
      change_status: changeStatus,
      next_action,
    };

    if (jsonMode) {
      output(result, { json: true, quiet: false });
    } else {
      logError(`✗ Node escalated: ${change}/${nodeId}`);
      if (opts.reason) info(`  Reason: ${opts.reason}`);
      if (skipped.length > 0) warn(`  Skipped dependents: ${skipped.join(', ')}`);
    }
  });

// ── specwork node (parent command) ─────────────────────────────────────────────

export function makeNodeCommand(): Command {
  const nodeCmd = new Command('node')
    .description('Manage node lifecycle within a workflow');

  nodeCmd.addCommand(startCmd);
  nodeCmd.addCommand(completeCmd);
  nodeCmd.addCommand(failCmd);
  nodeCmd.addCommand(escalateCmd);

  return nodeCmd;
}
