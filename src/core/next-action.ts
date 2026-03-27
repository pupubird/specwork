import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { NextAction } from '../types/state.js';

// ── Status keys used by buildNextAction ─────────────────────────────────────
export type NextActionStatus =
  | 'go:ready'
  | 'go:done'
  | 'go:blocked'
  | 'go:waiting'
  | 'node:start'
  | 'node:complete'
  | 'node:fail'
  | 'node:escalate'
  | 'node:verify:pass'
  | 'node:verify:fail';

export interface NextActionOpts {
  change: string;
  nodeId?: string;
  readyNodes?: string[];
  blockedNodes?: string[];
  retriesLeft?: number;
}

// ── Read change description from .specwork.yaml ──────────────────────────────

export function readChangeContext(root: string, change: string): string {
  try {
    const yamlPath = path.join(root, '.specwork', 'changes', change, '.specwork.yaml');
    const raw = fs.readFileSync(yamlPath, 'utf-8');
    const parsed = parseYaml(raw) as Record<string, unknown>;
    return typeof parsed.description === 'string' ? parsed.description : '';
  } catch {
    // Also check archive
    try {
      const archivePath = path.join(root, '.specwork', 'changes', 'archive', change, '.specwork.yaml');
      const raw = fs.readFileSync(archivePath, 'utf-8');
      const parsed = parseYaml(raw) as Record<string, unknown>;
      return typeof parsed.description === 'string' ? parsed.description : '';
    } catch {
      return '';
    }
  }
}

// ── Build next_action for a given status ────────────────────────────────────

export function buildNextAction(
  status: NextActionStatus,
  context: string,
  opts: NextActionOpts,
): NextAction {
  const { change, nodeId, readyNodes, blockedNodes, retriesLeft } = opts;

  switch (status) {
    case 'go:ready':
      return {
        command: 'team:spawn',
        description: `Create team exec-${change}, spawn one teammate per ready node: ${(readyNodes ?? []).join(', ')}`,
        context,
      };

    case 'go:done':
      return {
        command: 'suggest',
        description: 'Workflow complete. Present options to user.',
        context,
        suggest_to_user: [
          `Archive this change (specwork archive ${change})`,
          'Review all changes before archiving',
          'Request modifications to specific nodes',
        ],
      };

    case 'go:blocked':
      return {
        command: 'escalate',
        description: `No runnable nodes. Blocked: ${(blockedNodes ?? []).join(', ')}. Report to user and suggest escalation or manual fix.`,
        context,
      };

    case 'go:waiting':
      return {
        command: 'wait',
        description: `Nodes still in progress. Wait for teammates to complete, then run: specwork go ${change} --json`,
        context,
      };

    case 'node:start':
      return {
        command: 'subagent:spawn',
        description: `Context is assembled and included in this response. Spawn the appropriate subagent for node ${nodeId} using the context field. After the subagent finishes, run verification — the implementer never grades its own homework.`,
        context,
        on_pass: `specwork node verify ${change} ${nodeId} --json`,
        on_fail: `specwork node fail ${change} ${nodeId} --reason '<error>'`,
      };

    case 'node:complete':
      return {
        command: `specwork go ${change} --json`,
        description: `Node ${nodeId} complete. Run specwork go to get the next batch of ready nodes.`,
        context,
      };

    case 'node:fail':
      if (retriesLeft !== undefined && retriesLeft > 0) {
        return {
          command: 'subagent:respawn',
          description: `Node ${nodeId} failed. ${retriesLeft} retries remaining. Re-spawn subagent with failure feedback injected as context.`,
          context,
        };
      }
      return {
        command: `specwork node escalate ${change} ${nodeId}`,
        description: `Node ${nodeId} failed with no retries remaining. Escalate to user for manual intervention.`,
        context,
        suggest_to_user: [
          `Fix the issue manually and run: specwork node complete ${change} ${nodeId}`,
          `Skip this node: specwork node escalate ${change} ${nodeId}`,
          'Abort the workflow',
        ],
      };

    case 'node:escalate':
      return {
        command: 'suggest',
        description: `Node ${nodeId} escalated. Dependent nodes have been cascade-skipped. Report to user.`,
        context,
        suggest_to_user: [
          `Fix manually and retry: specwork node start ${change} ${nodeId}`,
          `Continue workflow without this node: specwork go ${change} --json`,
          'Abort the workflow',
        ],
      };

    case 'node:verify:pass':
      return {
        command: 'subagent:spawn',
        description: `Verification passed for ${nodeId}. Spawn specwork-summarizer (haiku) to write L0/L1/L2 context artifacts, then complete the node.`,
        context,
        on_pass: `specwork node complete ${change} ${nodeId}`,
      };

    case 'node:verify:fail':
      return {
        command: `specwork node fail ${change} ${nodeId} --reason '<failed checks>'`,
        description: `Verification failed for ${nodeId}. Fail the node so retry logic can kick in.`,
        context,
        on_fail: `specwork node fail ${change} ${nodeId} --reason '<failed checks>'`,
      };
  }
}
