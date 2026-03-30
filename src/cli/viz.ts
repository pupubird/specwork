import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { findSpecworkRoot } from '../utils/paths.js';
import { output } from '../utils/output.js';
import { success, info } from '../utils/logger.js';
import { SpecworkError } from '../utils/errors.js';
import { ExitCode } from '../types/index.js';
import { renderHTML, extractProposalSummary, extractSpecRequirements } from '../core/viz-renderer.js';
import type { Graph } from '../types/graph.js';

// Agent instructions returned after base HTML generation
const AGENT_INSTRUCTIONS = `You have a base HTML visualization at the path above. Enhance it to make the plan review more useful:

1. Read the overview.html file
2. Improve the visualization by editing the HTML directly:
   - Rewrite generic node descriptions with specific, meaningful summaries based on the change context
   - Add annotations or callouts for critical nodes (e.g., nodes with human gates, high-risk scope)
   - Improve the proposal summary — make it concise and actionable, not a raw copy of proposal.md
   - Add visual emphasis (colors, icons, borders) to highlight the most important parts
   - Reorganize or reformat sections if a different layout better suits this specific change
3. Open the final file in the browser when done

You have full freedom to restructure the HTML. The base is a starting point, not a constraint.`;

export function makeVizCommand(): Command {
  return new Command('viz')
    .description('Generate base HTML visualization of a change plan (agent enhances it)')
    .argument('<change>', 'Change name to visualize')
    .option('--refresh', 'Regenerate overview.html from current artifacts', false)
    .action((change: string, opts: { refresh: boolean }, cmd: Command) => {
      const root = findSpecworkRoot();
      const jsonMode = (cmd.parent?.opts() as { json?: boolean })?.json ?? false;
      const changeDir = path.join(root, '.specwork', 'changes', change);

      if (!fs.existsSync(changeDir)) {
        throw new SpecworkError(
          `Change "${change}" not found at ${changeDir}`,
          ExitCode.ERROR
        );
      }

      const overviewPath = path.join(changeDir, 'overview.html');

      // If file exists and no --refresh, report path only — agent opens it
      if (fs.existsSync(overviewPath) && !opts.refresh) {
        if (jsonMode) {
          output({ action: 'open', path: overviewPath, generated: false }, { json: true, quiet: false });
        } else {
          info(`Existing visualization at ${path.relative(root, overviewPath)}`);
          info(`Open with: open "${overviewPath}"`);
        }
        return;
      }

      // Generate base overview.html — agent enhances and opens
      const html = generateViz(root, change, changeDir);
      fs.writeFileSync(overviewPath, html, 'utf-8');

      if (jsonMode) {
        output({
          action: 'generated',
          path: overviewPath,
          generated: true,
          agent_instructions: AGENT_INSTRUCTIONS,
        }, { json: true, quiet: false });
      } else {
        success(`Base visualization written to ${path.relative(root, overviewPath)}`);
        info('');
        info('Agent instructions:');
        info(AGENT_INSTRUCTIONS);
      }
    });
}

function generateViz(root: string, change: string, changeDir: string): string {
  // Read graph.yaml
  const graphPath = path.join(root, '.specwork', 'graph', change, 'graph.yaml');
  let graph: Graph;
  if (fs.existsSync(graphPath)) {
    graph = parseYaml(fs.readFileSync(graphPath, 'utf-8')) as Graph;
  } else {
    // Minimal graph if not yet generated
    graph = { change, version: '1', created_at: new Date().toISOString(), nodes: [] };
  }

  // Read proposal.md
  const proposalPath = path.join(changeDir, 'proposal.md');
  const proposalContent = fs.existsSync(proposalPath)
    ? fs.readFileSync(proposalPath, 'utf-8')
    : '';
  const proposalSummary = extractProposalSummary(proposalContent);

  // Read specs
  const specsDir = path.join(changeDir, 'specs');
  const specFiles: Array<{ name: string; content: string }> = [];
  if (fs.existsSync(specsDir)) {
    for (const file of fs.readdirSync(specsDir)) {
      if (file.endsWith('.md')) {
        specFiles.push({
          name: file,
          content: fs.readFileSync(path.join(specsDir, file), 'utf-8'),
        });
      }
    }
  }
  const specRequirements = extractSpecRequirements(specFiles);

  // Read state.yaml (optional)
  const statePath = path.join(root, '.specwork', 'graph', change, 'state.yaml');
  let state: { nodes: Record<string, { status: string }> } | undefined;
  if (fs.existsSync(statePath)) {
    const parsed = parseYaml(fs.readFileSync(statePath, 'utf-8')) as { nodes: Record<string, { status: string }> };
    if (parsed?.nodes) {
      state = parsed;
    }
  }

  return renderHTML({ graph, proposalSummary, specRequirements, state });
}

