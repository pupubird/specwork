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
        description: `Spawn teammates for wave`,
        context,
        ready_queue: readyNodes ?? [],
      };

    case 'go:done':
      return {
        command: 'suggest',
        description: 'Workflow complete',
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
        description: `Blocked nodes: ${(blockedNodes ?? []).join(', ')}`,
        context,
      };

    case 'go:waiting':
      return {
        command: 'wait',
        description: `Nodes in progress`,
        context,
      };

    case 'node:start':
      return {
        command: `specwork node start ${change} ${nodeId} --json`,
        description: `Start node ${nodeId}`,
        context,
        on_pass: `specwork node verify ${change} ${nodeId} --json`,
        on_fail: `specwork node fail ${change} ${nodeId}`,
      };

    case 'node:complete':
      return {
        command: `specwork go ${change} --json`,
        description: `Node ${nodeId} complete`,
        context,
        current_wave: 0,
      };

    case 'node:fail':
      if (retriesLeft !== undefined && retriesLeft > 0) {
        return {
          command: 'subagent:respawn',
          description: `Retry node ${nodeId} (${retriesLeft} left)`,
          context,
        };
      }
      return {
        command: 'escalate',
        description: `Node ${nodeId} failed, retries exhausted`,
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
        description: `Node ${nodeId} escalated`,
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
        description: `Spawn summarizer for ${nodeId}`,
        context,
        on_pass: `specwork node complete ${change} ${nodeId} --json`,
      };

    case 'node:verify:fail':
      return {
        command: `specwork node fail ${change} ${nodeId}`,
        description: `Verification failed for ${nodeId}`,
        context,
        on_fail: `specwork node fail ${change} ${nodeId}`,
      };

    default:
      throw new Error(`Unknown status: ${status as string}`);
  }
}
