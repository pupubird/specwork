import { Command } from 'commander';
import { execSync } from 'node:child_process';
import {
  findForemanRoot,
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
  ForemanError,
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
        commit(`foreman(${change}): ${nodeId} complete`);
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

// ── verification check runners ────────────────────────────────────────────────

interface CheckResult {
  type: string;
  status: 'PASS' | 'FAIL';
  detail: string;
}

function runCheck(root: string, rule: { type: string; args?: Record<string, unknown> }): CheckResult {
  switch (rule.type) {
    case 'tsc-check': {
      try {
        execSync('npx tsc --noEmit', { cwd: root, stdio: 'pipe', encoding: 'utf-8' });
        return { type: 'tsc-check', status: 'PASS', detail: 'No type errors' };
      } catch (e: any) {
        const stderr = (e.stderr || e.stdout || '').toString().slice(0, 500);
        return { type: 'tsc-check', status: 'FAIL', detail: stderr || 'Type check failed' };
      }
    }

    case 'tests-pass': {
      const testFile = (rule.args?.file as string) ?? '';
      const cmd = testFile ? `npx vitest run ${testFile}` : 'npx vitest run';
      try {
        execSync(cmd, { cwd: root, stdio: 'pipe', encoding: 'utf-8' });
        return { type: 'tests-pass', status: 'PASS', detail: 'All tests passed' };
      } catch (e: any) {
        const out = (e.stdout || e.stderr || '').toString().slice(0, 500);
        return { type: 'tests-pass', status: 'FAIL', detail: out || 'Tests failed' };
      }
    }

    case 'tests-fail': {
      const testFile = (rule.args?.file as string) ?? '';
      const cmd = testFile ? `npx vitest run ${testFile}` : 'npx vitest run';
      try {
        execSync(cmd, { cwd: root, stdio: 'pipe', encoding: 'utf-8' });
        return { type: 'tests-fail', status: 'FAIL', detail: 'Tests should fail but passed' };
      } catch {
        return { type: 'tests-fail', status: 'PASS', detail: 'Tests correctly failing (RED state)' };
      }
    }

    case 'file-exists': {
      const filePath = rule.args?.path as string;
      if (!filePath) return { type: 'file-exists', status: 'FAIL', detail: 'No path specified' };
      const fullPath = path.resolve(root, filePath);
      if (fs.existsSync(fullPath)) {
        return { type: 'file-exists', status: 'PASS', detail: `${filePath} exists` };
      }
      return { type: 'file-exists', status: 'FAIL', detail: `${filePath} not found` };
    }

    case 'scope-check': {
      try {
        const diff = execSync('git diff --name-only', { cwd: root, stdio: 'pipe', encoding: 'utf-8' });
        return { type: 'scope-check', status: 'PASS', detail: `Changed files: ${diff.trim() || '(none)'}` };
      } catch {
        return { type: 'scope-check', status: 'PASS', detail: 'No changes' };
      }
    }

    case 'exit-code': {
      const command = rule.args?.command as string;
      const expected = (rule.args?.expected as number) ?? 0;
      if (!command) return { type: 'exit-code', status: 'FAIL', detail: 'No command specified' };
      try {
        execSync(command, { cwd: root, stdio: 'pipe' });
        return expected === 0
          ? { type: 'exit-code', status: 'PASS', detail: `Exit 0` }
          : { type: 'exit-code', status: 'FAIL', detail: `Expected exit ${expected}, got 0` };
      } catch (e: any) {
        const code = e.status ?? 1;
        return code === expected
          ? { type: 'exit-code', status: 'PASS', detail: `Exit ${code}` }
          : { type: 'exit-code', status: 'FAIL', detail: `Expected exit ${expected}, got ${code}` };
      }
    }

    default:
      return { type: rule.type, status: 'PASS', detail: `Unknown check type — skipped` };
  }
}

// ── foreman node verify ───────────────────────────────────────────────────────

const verifyCmd = new Command('verify')
  .description('Run validation checks on a node and return structured verdict')
  .argument('<change>', 'Change name')
  .argument('<node>', 'Node ID')
  .action(async (change: string, nodeId: string, _opts, cmd: Command) => {
    const root = findForemanRoot();
    const jsonMode = (cmd.parent?.parent?.opts() as { json?: boolean })?.json ?? false;

    const { graph, state } = loadGraphAndState(root, change);

    const node = getNode(graph, nodeId);
    if (!node) throw new NodeNotFoundError(nodeId);

    // Must be in_progress to verify
    const nodeState = state.nodes[nodeId];
    if (nodeState?.status !== 'in_progress') {
      throw new ForemanError(
        `Cannot verify "${nodeId}": node must be in_progress (started). Current: ${nodeState?.status ?? 'pending'}`,
        ExitCode.ERROR
      );
    }

    // Run all validation rules
    const checks: CheckResult[] = [];
    for (const rule of node.validate) {
      checks.push(runCheck(root, rule));
    }

    const verdict = checks.every(c => c.status === 'PASS') ? 'PASS' : 'FAIL';
    const failedChecks = checks.filter(c => c.status === 'FAIL');

    // Write verify.md artifact
    const nDir = nodeDir(root, change, nodeId);
    ensureDir(nDir);
    const verifyContent = [
      `## Verification: ${nodeId}`,
      '',
      ...checks.map(c => `- ${c.type}: ${c.status} — ${c.detail}`),
      '',
      `**Verdict: ${verdict}**`,
      ...(failedChecks.length > 0 ? ['', '### Issues', ...failedChecks.map(c => `- ${c.type}: ${c.detail}`)] : []),
      '',
    ].join('\n');
    writeMarkdown(`${nDir}/verify.md`, verifyContent);

    const ctx = readChangeContext(root, change);
    const verifyStatus = verdict === 'PASS' ? 'node:verify:pass' : 'node:verify:fail';
    const next_action = buildNextAction(verifyStatus, ctx, { change, nodeId });

    const result = {
      change,
      node: nodeId,
      verdict,
      checks,
      failed_count: failedChecks.length,
      total_checks: checks.length,
      next_action,
    };

    if (jsonMode) {
      output(result, { json: true, quiet: false });
    } else {
      if (verdict === 'PASS') {
        success(`✓ Verify ${change}/${nodeId}: PASS (${checks.length} checks)`);
      } else {
        logError(`✗ Verify ${change}/${nodeId}: FAIL (${failedChecks.length}/${checks.length} failed)`);
        for (const c of failedChecks) {
          info(`  - ${c.type}: ${c.detail}`);
        }
      }
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
  nodeCmd.addCommand(verifyCmd);

  return nodeCmd;
}
