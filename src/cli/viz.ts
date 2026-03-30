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
const AGENT_INSTRUCTIONS = `You have a base HTML visualization at the path above — a 6-slide presentation for the user to review the plan. Read overview.html first, then read the proposal.md, design.md, and specs/ to understand the change deeply.

Enhance the slides by editing the HTML. The base has placeholder comments (<!-- AGENT: ... -->) marking where you fill in content. The CSS classes are already defined — use them.

## Slides to enhance:

**Slide 2 — The Problem (before/after):**
Fill in 3-4 pain points for "Today" and matching improvements for "After". Keep each point to one line. Use \`<code>\` for commands/paths.

**Slide 3 — How It Works:**
Replace placeholder flow-step blocks with 3-5 concrete steps showing the key mechanics. Use flow-visual divs for visual elements when helpful. Use colors: blue=input, amber=safety, green=success, purple=output.

**Slide 4 — What You'll See (MOST IMPORTANT):**
Show the actual user experience with mock outputs. Adapt to the type of change:
- **CLI tool** → mock terminal sessions (\`.terminal\`) with realistic command + output
- **Frontend** → browser wireframes (\`.browser\`) showing the UI being built + component states
- **Backend API** → curl request/response pairs, before/after auth, error states
- **Infrastructure** → mock dashboards with metrics (\`.metrics-row\`), SVG charts, config files
- **Library** → code examples showing before/after usage
Show 2-4 scenes. Each scene gets a numbered \`.scene\` header. The user should understand the change just by looking at this slide.

**Slide 5 — What Changes:**
The node list and stats are auto-generated. You may add an \`.impact-stat-card\` for heaviest file, new exports, or new CLI surface if relevant.

**Slide 6 — Watch Out For:**
Add 1-3 risk cards. Look at the graph for: shared file contention (multiple nodes writing same file), regression risk, breaking changes, dependency ordering issues.

## Rules:
- Be concise — this is a presentation, not documentation
- Show, don't tell — visuals over text
- Keep the dark theme and Geist Mono font
- Open the file in the browser when done: \`open <path>\` (macOS) or \`xdg-open <path>\` (Linux)
- You have full freedom to add/remove slides or restructure if it better serves this specific change`;

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

