import { Command } from 'commander';
import fs from 'node:fs';
import {
  findSpecworkRoot,
  graphPath,
  statePath,
  nodeDir,
  currentNodePath,
} from '../utils/paths.js';
import { readYaml, writeYaml, ensureDir } from '../io/filesystem.js';
import { getReadyNodes } from '../core/graph-walker.js';
import { transitionNode } from '../core/state-machine.js';
import { assembleContext, renderContext } from '../core/context-assembler.js';
import { output } from '../utils/output.js';
import { success, info } from '../utils/logger.js';
import { ChangeNotFoundError, SpecworkError } from '../utils/errors.js';
import { ExitCode } from '../types/index.js';
import { buildNextAction, readChangeContext } from '../core/next-action.js';
import type { Graph } from '../types/graph.js';
import type { WorkflowState } from '../types/state.js';

// ── specwork wave start <change> ──────────────────────────────────────────────
// Marks all ready nodes in_progress, assembles micro-spec context for each,
// and returns them as a single payload. Replaces per-node `specwork node start`
// as the engine's spawn trigger.

const startCmd = new Command('start')
  .description('Open the next wave: mark ready nodes in_progress and return per-node contexts')
  .argument('<change>', 'Change name')
  .action((change: string, _opts, cmd: Command) => {
    const root = findSpecworkRoot();
    const jsonMode = (cmd.parent?.parent?.opts() as { json?: boolean })?.json ?? false;

    const gp = graphPath(root, change);
    if (!fs.existsSync(gp)) throw new ChangeNotFoundError(change);

    const graph = readYaml<Graph>(gp);
    let state = readYaml<WorkflowState>(statePath(root, change));

    const ready = getReadyNodes(graph, state);
    if (ready.length === 0) {
      throw new SpecworkError(
        `No ready nodes in change "${change}". Run: specwork go ${change} --json`,
        ExitCode.BLOCKED,
      );
    }

    // Transition each ready node to in_progress, ensure artifact dir exists
    for (const node of ready) {
      state = transitionNode(state, node.id, 'in_progress');
      ensureDir(nodeDir(root, change, node.id));
    }

    // Track the first node as "current" (legacy; used by hooks)
    fs.writeFileSync(currentNodePath(root), `${change}/${ready[0].id}`, 'utf8');

    writeYaml(statePath(root, change), state);

    // Assemble per-node context payload
    const nodes = ready.map(node => ({
      id: node.id,
      type: node.type,
      agent: node.agent ?? null,
      description: node.description,
      command: node.command ?? null,
      scope: node.scope,
      deps: node.deps,
      gate: node.gate ?? null,
      model: node.model ?? null,
      retry: node.retry ?? 2,
      worktree: node.worktree ?? false,
      context: renderContext(assembleContext(root, change, node.id)),
    }));

    const ctx = readChangeContext(root, change);
    const next_action = buildNextAction('wave:spawn', ctx, {
      change,
      readyNodes: ready.map(n => n.id),
    });

    if (jsonMode) {
      output({
        change,
        wave: state.current_wave ?? 1,
        nodes,
        next_action,
      }, { json: true, quiet: false });
    } else {
      success(`Wave opened — ${ready.length} node(s) in_progress:`);
      for (const n of nodes) {
        info(`  ${n.id}  (${n.type}${n.agent ? `, ${n.agent}` : ''})`);
      }
    }
  });

export function makeWaveCommand(): Command {
  const waveCmd = new Command('wave')
    .description('Manage wave-level lifecycle (open a wave, fetch per-node contexts)');

  waveCmd.addCommand(startCmd);
  return waveCmd;
}
