import { Command } from 'commander';
import { execSync } from 'node:child_process';
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
  SpecworkError,
  NodeNotFoundError,
  ChangeNotFoundError,
} from '../utils/errors.js';
import { ExitCode } from '../types/index.js';
import { buildNextAction, readChangeContext } from '../core/next-action.js';
import {
  runChecks,
  resolveCustomChecks,
  detectRegressions,
} from '../core/verification.js';
import type { CheckResult } from '../core/verification.js';
import type { Graph } from '../types/graph.js';
import type { WorkflowState, VerifyHistoryEntry } from '../types/state.js';
import { parse as parseYaml } from 'yaml';
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

    const ctx = readChangeContext(root, change);
    const next_action = buildNextAction('node:start', ctx, { change, nodeId });

    const nodeInfo = {
      change,
      node: nodeId,
      type: node.type,
      status: 'in_progress',
      scope: node.scope,
      deps: node.deps,
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
function checkOffTask(root: string, change: string, nodeId: string): void {
  const tasksPath = path.join(changeDir(root, change), 'tasks.md');
  if (!fs.existsSync(tasksPath)) return;

  // Parse node ID to get group/task indices
  const match = /^impl-(\d+)-(\d+)$/.exec(nodeId);
  if (!match) return; // non-impl nodes (snapshot, write-tests, integration) don't map to tasks

  const targetGroup = parseInt(match[1], 10);
  const targetTask = parseInt(match[2], 10);

  const content = fs.readFileSync(tasksPath, 'utf-8');
  const lines = content.split('\n');

  let currentGroup = 0;
  let taskInGroup = 0;

  for (let i = 0; i < lines.length; i++) {
    // Section header
    if (/^##\s+/.test(lines[i])) {
      currentGroup++;
      taskInGroup = 0;
      continue;
    }

    // Checkbox task
    if (/^- \[ \]/.test(lines[i])) {
      taskInGroup++;
      if (currentGroup === targetGroup && taskInGroup === targetTask) {
        lines[i] = lines[i].replace('- [ ]', '- [x]');
        fs.writeFileSync(tasksPath, lines.join('\n'), 'utf-8');
        return;
      }
    }
  }
}

// ── specwork node complete ─────────────────────────────────────────────────────

const completeCmd = new Command('complete')
  .description('Mark a node as complete, write L0, commit, clear scope')
  .argument('<change>', 'Change name')
  .argument('<node>', 'Node ID')
  .option('--l0 <summary>', 'L0 headline summary for this node')
  .option('--no-commit', 'Skip git commit')
  .action(async (change: string, nodeId: string, opts: { l0?: string; commit: boolean }, cmd: Command) => {
    const root = findSpecworkRoot();
    const jsonMode = (cmd.parent?.parent?.opts() as { json?: boolean })?.json ?? false;

    const { graph, state } = loadGraphAndState(root, change);

    const node = getNode(graph, nodeId);
    if (!node) throw new NodeNotFoundError(nodeId);

    // Enforce mandatory verification
    const nodeState = state.nodes[nodeId];
    if (!nodeState?.verified) {
      if (jsonMode) {
        const ctx = readChangeContext(root, change);
        const next_action = buildNextAction('node:verify:pass', ctx, { change, nodeId });
        next_action.command = `specwork node verify ${change} ${nodeId}`;
        next_action.description = 'Node must pass verification before completion';
        output({
          change,
          node: nodeId,
          error: 'Node must pass verification before completion',
          next_action,
        }, { json: true, quiet: false });
        process.exitCode = ExitCode.ERROR;
        return;
      }
      throw new SpecworkError(
        `Cannot complete "${nodeId}": node must pass verification first. Run: specwork node verify ${change} ${nodeId}`,
        ExitCode.ERROR
      );
    }

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

    // Check off corresponding task in tasks.md
    checkOffTask(root, change, nodeId);

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
        commit(`specwork(${change}): ${nodeId} complete`);
      } catch (err) {
        warn(`Git commit skipped: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

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

    // Clear scope and current-node tracking
    clearScope(root);
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

    clearScope(root);
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

// ── load custom checks from config ───────────────────────────────────────────

function loadCustomChecks(root: string): Record<string, any> {
  const configPath = path.join(root, '.specwork', 'config.yaml');
  if (!fs.existsSync(configPath)) return {};
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = parseYaml(raw) as Record<string, unknown>;
    return (config.checks as Record<string, any>) ?? {};
  } catch {
    return {};
  }
}

// ── specwork node verify ───────────────────────────────────────────────────────

const verifyCmd = new Command('verify')
  .description('Run validation checks on a node and return structured verdict')
  .argument('<change>', 'Change name')
  .argument('<node>', 'Node ID')
  .action(async (change: string, nodeId: string, _opts, cmd: Command) => {
    const root = findSpecworkRoot();
    const jsonMode = (cmd.parent?.parent?.opts() as { json?: boolean })?.json ?? false;

    let { graph, state } = loadGraphAndState(root, change);

    const node = getNode(graph, nodeId);
    if (!node) throw new NodeNotFoundError(nodeId);

    // Must be in_progress to verify
    const nodeState = state.nodes[nodeId];
    if (nodeState?.status !== 'in_progress') {
      throw new SpecworkError(
        `Cannot verify "${nodeId}": node must be in_progress (started). Current: ${nodeState?.status ?? 'pending'}`,
        ExitCode.ERROR
      );
    }

    // Resolve custom checks from config
    const customChecks = loadCustomChecks(root);
    const resolvedRules = resolveCustomChecks(node.validate, customChecks, node.scope);

    // Run all checks with fail-fast and scope
    const verifyResult = runChecks(root, resolvedRules, {
      failFast: true,
      scope: node.scope,
    });

    // Collect full raw output for verify-output.txt
    const rawOutputLines = verifyResult.checks.map(c => {
      let line = `[${c.status}] ${c.type}: ${c.detail}`;
      if (c.errors && c.errors.length > 0) {
        line += '\n' + c.errors.map(e => {
          let errLine = `  - ${e.message}`;
          if (e.file) errLine = `  - ${e.file}${e.line ? `:${e.line}` : ''}: ${e.message}`;
          if (e.code) errLine += ` (${e.code})`;
          return errLine;
        }).join('\n');
      }
      return line;
    });

    // Detect regressions from previous verification history
    const existingHistory: VerifyHistoryEntry[] = (nodeState as any).verify_history ?? [];
    const previousChecks = existingHistory.length > 0
      ? existingHistory[existingHistory.length - 1].checks.map(c => ({
          type: c.type,
          status: c.status as 'PASS' | 'FAIL' | 'SKIPPED',
          detail: c.detail,
          duration_ms: c.duration_ms,
        }))
      : [];
    const regressions = detectRegressions(previousChecks, verifyResult.checks);

    // Build history entry
    const attempt = existingHistory.length + 1;
    const historyEntry: VerifyHistoryEntry = {
      attempt,
      verdict: verifyResult.verdict,
      timestamp: new Date().toISOString(),
      checks: verifyResult.checks.map(c => ({
        type: c.type,
        status: c.status,
        detail: c.detail,
        duration_ms: c.duration_ms,
      })),
      regressions,
    };

    // Update node state with verification info
    const updatedHistory = [...existingHistory, historyEntry];
    const updatedNodeState = {
      ...nodeState,
      verified: verifyResult.verdict === 'PASS',
      last_verdict: verifyResult.verdict,
      verify_history: updatedHistory,
    };
    state = {
      ...state,
      updated_at: new Date().toISOString(),
      nodes: {
        ...state.nodes,
        [nodeId]: updatedNodeState,
      },
    };
    saveState(root, change, state);

    // Write verify.md artifact (full history)
    const nDir = nodeDir(root, change, nodeId);
    ensureDir(nDir);

    const verifyMdSections: string[] = [`## Verification: ${nodeId}`, ''];
    for (const entry of updatedHistory) {
      verifyMdSections.push(`### Attempt ${entry.attempt} — ${entry.verdict} (${entry.timestamp})`);
      verifyMdSections.push('');
      for (const c of entry.checks) {
        verifyMdSections.push(`- ${c.type}: ${c.status} — ${c.detail}`);
      }
      if (entry.regressions.length > 0) {
        verifyMdSections.push('');
        verifyMdSections.push(`**Regressions:** ${entry.regressions.join(', ')}`);
      }
      verifyMdSections.push('');
    }
    verifyMdSections.push(`**Latest Verdict: ${verifyResult.verdict}**`);
    verifyMdSections.push('');
    writeMarkdown(`${nDir}/verify.md`, verifyMdSections.join('\n'));

    // Write verify-output.txt (full raw output)
    fs.writeFileSync(`${nDir}/verify-output.txt`, rawOutputLines.join('\n\n'), 'utf-8');

    const ctx = readChangeContext(root, change);
    const verifyStatus = verifyResult.verdict === 'PASS' ? 'node:verify:pass' : 'node:verify:fail';
    const next_action = buildNextAction(verifyStatus, ctx, { change, nodeId });

    const fullOutputPath = path.relative(root, `${nDir}/verify-output.txt`);

    const result = {
      change,
      node: nodeId,
      verdict: verifyResult.verdict,
      checks: verifyResult.checks,
      failed_count: verifyResult.failed_count,
      total_checks: verifyResult.total_checks,
      duration_ms: verifyResult.duration_ms,
      regressions: regressions.length > 0 ? regressions : undefined,
      full_output_path: fullOutputPath,
      next_action,
    };

    if (jsonMode) {
      output(result, { json: true, quiet: false });
    } else {
      if (verifyResult.verdict === 'PASS') {
        success(`✓ Verify ${change}/${nodeId}: PASS (${verifyResult.total_checks} checks, ${verifyResult.duration_ms}ms)`);
      } else {
        const failedChecks = verifyResult.checks.filter(c => c.status === 'FAIL');
        logError(`✗ Verify ${change}/${nodeId}: FAIL (${verifyResult.failed_count}/${verifyResult.total_checks} failed)`);
        for (const c of failedChecks) {
          info(`  - ${c.type}: ${c.detail}`);
        }
        if (regressions.length > 0) {
          warn(`  ⚠ Regressions: ${regressions.join(', ')}`);
        }
      }
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
  nodeCmd.addCommand(verifyCmd);

  return nodeCmd;
}
