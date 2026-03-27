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
import type { Graph } from '../types/graph.js';
import type { WorkflowState } from '../types/state.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ArchiveResult {
  change: string;
  archivePath: string;
  specsPromoted: string[];
  nodesCleaned: boolean;
  forced: boolean;
}

// ── Completion Guard ─────────────────────────────────────────────────────────

export function checkCompletion(root: string, change: string): { ok: boolean; blocking: string[] } {
  const sp = statePath(root, change);

  // If state.yaml exists, check node statuses
  if (fs.existsSync(sp)) {
    const state = readYaml<WorkflowState>(sp);
    const blocking: string[] = [];

    for (const [nodeId, ns] of Object.entries(state.nodes)) {
      const status = ns.status;
      if (status !== 'complete' && status !== 'skipped') {
        blocking.push(nodeId);
      }
    }

    return { ok: blocking.length === 0, blocking };
  }

  // Fallback: check tasks.md for unchecked items
  const tasksPath = path.join(changeDir(root, change), 'tasks.md');
  if (fs.existsSync(tasksPath)) {
    const content = fs.readFileSync(tasksPath, 'utf-8');
    const unchecked = content.split('\n').filter(l => /^- \[ \]/.test(l));
    if (unchecked.length > 0) {
      return { ok: false, blocking: unchecked.map(l => l.trim()) };
    }
  }

  return { ok: true, blocking: [] };
}

// ── Summary Builder (renamed from buildDigest) ──────────────────────────────

function buildSummary(root: string, change: string): string {
  const lines: string[] = [];

  const sp = statePath(root, change);
  const state = fs.existsSync(sp) ? readYaml<WorkflowState>(sp) : null;
  const gp = graphPath(root, change);
  const graph = fs.existsSync(gp) ? readYaml<Graph>(gp) : null;

  // Read change description
  let description = '';
  const metaPath = path.join(root, '.specwork', 'changes', change, '.specwork.yaml');
  if (fs.existsSync(metaPath)) {
    const meta = readYaml<Record<string, unknown>>(metaPath);
    description = typeof meta.description === 'string' ? meta.description : '';
  }

  const nodeCount = graph?.nodes.length ?? 0;
  const status = state?.status ?? 'unknown';
  const archivedDate = new Date().toISOString().split('T')[0];

  lines.push(`# Summary: ${change}`);
  lines.push('');
  lines.push(`**Archived:** ${archivedDate} | **Nodes:** ${nodeCount} | **Status:** ${status}`);
  lines.push('');
  if (description) {
    lines.push('## Summary');
    lines.push('');
    lines.push(description);
    lines.push('');
  }

  // Node Timeline (L0)
  const nd = nodesDir(root, change);
  const nodeDirNames = fs.existsSync(nd)
    ? fs.readdirSync(nd).filter(d => fs.statSync(path.join(nd, d)).isDirectory())
    : [];

  lines.push('## Node Timeline');
  lines.push('');
  for (const nodeId of nodeDirNames) {
    const l0Path = path.join(nd, nodeId, 'L0.md');
    if (fs.existsSync(l0Path)) {
      const l0Content = fs.readFileSync(l0Path, 'utf-8').trim();
      const match = l0Content.match(/^-\s*\S+:\s*(.+)$/m);
      const headline = match ? match[1].trim() : l0Content;
      lines.push(`- **${nodeId}**: ${headline}`);
    } else {
      lines.push(`- **${nodeId}**: (no L0)`);
    }
  }
  lines.push('');

  // Node Details (L1)
  const nodesWithL1: { nodeId: string; content: string }[] = [];
  for (const nodeId of nodeDirNames) {
    const l1Path = path.join(nd, nodeId, 'L1.md');
    if (fs.existsSync(l1Path)) {
      const l1Content = fs.readFileSync(l1Path, 'utf-8').trim();
      if (l1Content) {
        nodesWithL1.push({ nodeId, content: l1Content });
      }
    }
  }

  if (nodesWithL1.length > 0) {
    lines.push('## Node Details');
    lines.push('');
    for (const { nodeId, content } of nodesWithL1) {
      lines.push(`### ${nodeId}`);
      lines.push('');
      lines.push(content);
      lines.push('');
    }
  }

  // Verification Summary
  if (state) {
    const verifiedNodes = Object.entries(state.nodes).filter(
      ([, ns]) => ns.last_verdict !== null && ns.last_verdict !== undefined
    );

    if (verifiedNodes.length > 0) {
      lines.push('## Verification Summary');
      lines.push('');
      lines.push('| Node | Verdict |');
      lines.push('|------|---------|');
      for (const [nodeId, ns] of verifiedNodes) {
        lines.push(`| ${nodeId} | ${ns.last_verdict} |`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ── Archive Change ───────────────────────────────────────────────────────────

export function archiveChange(root: string, change: string, opts?: { force?: boolean }): ArchiveResult {
  const src = changeDir(root, change);
  if (!fs.existsSync(src)) {
    throw new SpecworkError(
      `Change directory not found: "${change}". Cannot archive.`,
      ExitCode.ERROR
    );
  }

  const forced = opts?.force ?? false;

  // Check completion guard (unless forced)
  if (!forced) {
    const completion = checkCompletion(root, change);
    if (!completion.ok) {
      throw new SpecworkError(
        `Cannot archive "${change}": blocking nodes: ${completion.blocking.join(', ')}. Complete all nodes or use --force.`,
        ExitCode.ERROR
      );
    }
  }

  const dest = archiveChangeDir(root, change);

  // Check destination doesn't already exist
  if (fs.existsSync(dest)) {
    throw new SpecworkError(
      `Cannot archive "${change}": already archived at ${dest}`,
      ExitCode.ERROR
    );
  }

  fs.mkdirSync(dest, { recursive: true });

  // 1. Copy change dir contents to archive
  fs.cpSync(src, dest, { recursive: true });

  // 2. Build summary.md
  const summary = buildSummary(root, change);
  fs.writeFileSync(path.join(dest, 'summary.md'), summary, 'utf-8');

  // 3. Promote specs to .specwork/specs/
  const specsPromoted: string[] = [];
  const specsDir = path.join(src, 'specs');
  if (fs.existsSync(specsDir)) {
    const specFiles = fs.readdirSync(specsDir).filter(f => !f.startsWith('.'));
    if (specFiles.length > 0) {
      const targetSpecsDir = path.join(root, '.specwork', 'specs');
      fs.mkdirSync(targetSpecsDir, { recursive: true });
      for (const file of specFiles) {
        fs.cpSync(path.join(specsDir, file), path.join(targetSpecsDir, file), { recursive: true });
        specsPromoted.push(file);
      }
    }
  }

  // 4. Update .specwork.yaml status and archived_at
  const metaPath = path.join(dest, '.specwork.yaml');
  if (fs.existsSync(metaPath)) {
    const meta = readYaml<Record<string, unknown>>(metaPath);
    meta.status = 'archived';
    meta.archived_at = new Date().toISOString();
    writeYaml(metaPath, meta);
  }

  // 5. Remove originals
  fs.rmSync(src, { recursive: true, force: true });

  let nodesCleaned = false;
  const gd = graphDir(root, change);
  if (fs.existsSync(gd)) {
    fs.rmSync(gd, { recursive: true, force: true });
    nodesCleaned = true;
  }

  const nd = nodesDir(root, change);
  if (fs.existsSync(nd)) {
    fs.rmSync(nd, { recursive: true, force: true });
    nodesCleaned = true;
  }

  return {
    change,
    archivePath: dest,
    specsPromoted,
    nodesCleaned,
    forced,
  };
}
