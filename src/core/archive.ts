import fs from 'node:fs';
import path from 'node:path';
import { SpecworkError } from '../utils/errors.js';
import { ExitCode } from '../types/index.js';
import {
  changeDir,
  graphDir,
  nodesDir,
  archiveChangeDir,
  graphPath,
  statePath,
} from '../utils/paths.js';
import { readYaml, writeYaml } from '../io/filesystem.js';
import type { Graph, GraphNode } from '../types/graph.js';
import type { WorkflowState } from '../types/state.js';

function buildSummary(root: string, change: string): string {
  const lines: string[] = [`# Archive: ${change}\n`];

  // Graph section
  const gp = graphPath(root, change);
  if (fs.existsSync(gp)) {
    const graph = readYaml<Graph>(gp);
    lines.push('## Graph\n');
    lines.push(`Nodes: ${graph.nodes.length} | Created: ${graph.created_at}\n`);
    lines.push('| ID | Type | Deps |');
    lines.push('|----|------|------|');
    for (const node of graph.nodes) {
      lines.push(`| ${node.id} | ${node.type} | ${node.deps.join(', ') || '-'} |`);
    }
    lines.push('');
  }

  // State section
  const sp = statePath(root, change);
  if (fs.existsSync(sp)) {
    const state = readYaml<WorkflowState>(sp);
    lines.push('## State\n');
    lines.push(`Status: ${state.status}`);
    lines.push(`Updated: ${state.updated_at}\n`);
    for (const [id, ns] of Object.entries(state.nodes)) {
      lines.push(`- **${id}**: ${ns.status}${ns.retries ? ` (retries: ${ns.retries})` : ''}`);
    }
    lines.push('');
  }

  // Nodes section — consolidate L0s, verify, qa-report
  const nd = nodesDir(root, change);
  if (fs.existsSync(nd)) {
    const nodeDirs = fs.readdirSync(nd).filter(d =>
      fs.statSync(path.join(nd, d)).isDirectory()
    );
    if (nodeDirs.length > 0) {
      lines.push('## Nodes\n');
      for (const nodeId of nodeDirs) {
        const nodeBase = path.join(nd, nodeId);
        lines.push(`### ${nodeId}\n`);

        // L0
        const l0Path = path.join(nodeBase, 'L0.md');
        if (fs.existsSync(l0Path)) {
          lines.push(fs.readFileSync(l0Path, 'utf-8').trim());
        }

        // verify.md
        const verifyPath = path.join(nodeBase, 'verify.md');
        if (fs.existsSync(verifyPath)) {
          lines.push('');
          lines.push('**Verify:**');
          lines.push(fs.readFileSync(verifyPath, 'utf-8').trim());
        }

        // qa-report.md
        const qaPath = path.join(nodeBase, 'qa-report.md');
        if (fs.existsSync(qaPath)) {
          lines.push('');
          lines.push('**QA:**');
          lines.push(fs.readFileSync(qaPath, 'utf-8').trim());
        }

        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

export function archiveChange(root: string, change: string): void {
  const src = changeDir(root, change);
  if (!fs.existsSync(src)) {
    throw new SpecworkError(
      `Change directory not found: "${change}". Cannot archive.`,
      ExitCode.ERROR
    );
  }

  // Validate all tasks are checked off before archiving
  const tasksPath = path.join(src, 'tasks.md');
  if (fs.existsSync(tasksPath)) {
    const content = fs.readFileSync(tasksPath, 'utf-8');
    const unchecked = content.split('\n').filter(l => /^- \[ \]/.test(l));
    if (unchecked.length > 0) {
      throw new SpecworkError(
        `Cannot archive "${change}": ${unchecked.length} unchecked task(s) remain in tasks.md. Complete all tasks before archiving.`,
        ExitCode.ERROR
      );
    }
  }

  const dest = archiveChangeDir(root, change);
  fs.mkdirSync(dest, { recursive: true });

  // 1. Copy change dir contents to archive (proposal, design, tasks, specs)
  fs.cpSync(src, dest, { recursive: true });

  // 2. Build consolidated summary.md from graph, state, and node artifacts
  const summary = buildSummary(root, change);
  fs.writeFileSync(path.join(dest, 'summary.md'), summary, 'utf-8');

  // 3. Promote specs to .specwork/specs/ (source of truth)
  const specsDir = path.join(src, 'specs');
  if (fs.existsSync(specsDir)) {
    const specFiles = fs.readdirSync(specsDir).filter(f => !f.startsWith('.'));
    if (specFiles.length > 0) {
      const targetSpecsDir = path.join(root, '.specwork', 'specs');
      fs.mkdirSync(targetSpecsDir, { recursive: true });
      for (const file of specFiles) {
        fs.cpSync(path.join(specsDir, file), path.join(targetSpecsDir, file), { recursive: true });
      }
    }
  }

  // 4. Update .specwork.yaml status to 'archived' (in archive copy)
  const metaPath = path.join(dest, '.specwork.yaml');
  if (fs.existsSync(metaPath)) {
    const meta = readYaml<Record<string, unknown>>(metaPath);
    meta.status = 'archived';
    writeYaml(metaPath, meta);
  }

  // 5. Remove originals
  fs.rmSync(src, { recursive: true, force: true });

  const gd = graphDir(root, change);
  if (fs.existsSync(gd)) {
    fs.rmSync(gd, { recursive: true, force: true });
  }

  const nd = nodesDir(root, change);
  if (fs.existsSync(nd)) {
    fs.rmSync(nd, { recursive: true, force: true });
  }
}
