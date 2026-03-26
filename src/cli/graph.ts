import { Command } from 'commander';
import { generateGraph } from '../core/graph-generator.js';
import { validateGraph } from '../core/graph-validator.js';
import { initializeState } from '../core/state-machine.js';
import { readYaml, writeYaml, exists, ensureDir } from '../io/filesystem.js';
import {
  findForemanRoot,
  graphPath,
  statePath,
  nodesDir,
} from '../utils/paths.js';
import { success, error, warn, info } from '../utils/logger.js';
import { table } from '../utils/output.js';
import { ForemanError, ChangeNotFoundError } from '../utils/errors.js';
import { ExitCode } from '../types/index.js';
import type { Graph } from '../types/graph.js';
import type { WorkflowState } from '../types/state.js';

export function makeGraphCommand(): Command {
  const graph = new Command('graph').description('Manage Foreman execution graphs');

  // ── generate ─────────────────────────────────────────────────────────────

  graph
    .command('generate <change>')
    .description('Generate graph.yaml and state.yaml from tasks.md')
    .action(async (change: string) => {
      const root = findForemanRoot();

      const generatedGraph = generateGraph(root, change);

      const gPath = graphPath(root, change);
      const sPath = statePath(root, change);
      const nDir = nodesDir(root, change);

      writeYaml(gPath, generatedGraph);
      writeYaml(sPath, initializeState(generatedGraph));
      ensureDir(nDir);

      success(`Graph generated: ${gPath}`);
      info(`State initialized: ${sPath}`);
      info(`Nodes directory created: ${nDir}`);
      info('');

      // Print generated graph as table
      printGraphTable(generatedGraph, null);
    });

  // ── show ─────────────────────────────────────────────────────────────────

  graph
    .command('show <change>')
    .description('Display the graph as a table or mermaid diagram')
    .option('--format <format>', 'Output format: table | mermaid', 'table')
    .action(async (change: string, opts: { format: string }, cmd: Command) => {
      const root = findForemanRoot();
      const gPath = graphPath(root, change);
      const jsonMode = (cmd.parent?.parent?.opts() as { json?: boolean })?.json ?? false;

      if (!exists(gPath)) {
        throw new ChangeNotFoundError(change);
      }

      const g = readYaml<Graph>(gPath);

      let state: WorkflowState | null = null;
      const sPath = statePath(root, change);
      if (exists(sPath)) {
        state = readYaml<WorkflowState>(sPath);
      }

      if (jsonMode) {
        const data = {
          change,
          nodes: g.nodes.map(node => ({
            id: node.id,
            type: node.type,
            agent: node.agent ?? null,
            command: node.command ?? null,
            deps: node.deps,
            status: state ? (state.nodes[node.id]?.status ?? 'unknown') : null,
          })),
        };
        process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      } else if (opts.format === 'mermaid') {
        printMermaid(g);
      } else {
        printGraphTable(g, state);
      }
    });

  // ── validate ─────────────────────────────────────────────────────────────

  graph
    .command('validate <change>')
    .description('Validate graph.yaml and report errors/warnings')
    .action(async (change: string) => {
      const root = findForemanRoot();
      const gPath = graphPath(root, change);

      if (!exists(gPath)) {
        throw new ChangeNotFoundError(change);
      }

      const g = readYaml<Graph>(gPath);
      const result = validateGraph(g);

      if (result.warnings.length > 0) {
        for (const w of result.warnings) {
          warn(`  WARN  ${w}`);
        }
      }

      if (result.errors.length > 0) {
        for (const e of result.errors) {
          error(`  ERR   ${e}`);
        }
        throw new ForemanError(
          `Graph "${change}" is invalid (${result.errors.length} error(s))`,
          ExitCode.ERROR
        );
      }

      success(`Graph "${change}" is valid (${result.warnings.length} warning(s))`);
    });

  return graph;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function printGraphTable(g: Graph, state: WorkflowState | null): void {
  const headers = ['ID', 'Type', 'Agent/Cmd', 'Deps', 'Status'];
  const rows = g.nodes.map(node => {
    const agentOrCmd = node.agent ?? node.command ?? '-';
    const deps = node.deps.length > 0 ? node.deps.join(', ') : '-';
    const status = state ? (state.nodes[node.id]?.status ?? 'unknown') : '-';
    return [node.id, node.type, agentOrCmd, deps, status];
  });

  table(headers, rows);
}

function printMermaid(g: Graph): void {
  const lines: string[] = ['graph TD'];

  for (const node of g.nodes) {
    const label = `${node.id}[${node.id}\\n${node.type}]`;
    if (node.deps.length === 0) {
      lines.push(`  ${label}`);
    }
    for (const dep of node.deps) {
      lines.push(`  ${dep} --> ${label}`);
    }
  }

  process.stdout.write(lines.join('\n') + '\n');
}
