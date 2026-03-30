import type { Graph, GraphNode } from '../types/graph.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SpecRequirementGroup {
  file: string;
  requirements: string[];
}

export interface VizData {
  graph: Graph;
  proposalSummary: string;
  specRequirements: SpecRequirementGroup[];
  state?: { nodes: Record<string, { status: string }> };
}

// ── buildMermaidDiagram ──────────────────────────────────────────────────────

export function buildMermaidDiagram(graph: Graph): string {
  const lines: string[] = ['graph TD'];

  for (const node of graph.nodes) {
    const label = buildNodeLabel(node);
    lines.push(`  ${node.id}["${label}"]`);

    for (const dep of node.deps) {
      lines.push(`  ${dep} --> ${node.id}`);
    }
  }

  // Class definitions for type-based coloring
  lines.push('');
  lines.push('  classDef snapshot fill:#9e9e9e,stroke:#757575,color:#fff');
  lines.push('  classDef test fill:#2196f3,stroke:#1565c0,color:#fff');
  lines.push('  classDef impl fill:#4caf50,stroke:#2e7d32,color:#fff');
  lines.push('  classDef integration fill:#9c27b0,stroke:#6a1b9a,color:#fff');

  // Assign classes to nodes
  for (const node of graph.nodes) {
    const cls = getNodeClass(node);
    lines.push(`  class ${node.id} ${cls}`);
  }

  return lines.join('\n');
}

function buildNodeLabel(node: GraphNode): string {
  const desc = node.description || node.id;
  if (node.sub_tasks && node.sub_tasks.length > 0) {
    return `${desc} (${node.sub_tasks.length} tasks)`;
  }
  return desc;
}

function getNodeClass(node: GraphNode): string {
  if (node.id === 'snapshot' || node.command?.includes('snapshot')) return 'snapshot';
  if (node.id.startsWith('write-tests') || node.id === 'write-tests') return 'test';
  if (node.id === 'integration') return 'integration';
  if (node.id.startsWith('impl')) return 'impl';
  return 'snapshot';
}

// ── extractProposalSummary ───────────────────────────────────────────────────

export function extractProposalSummary(content: string): string {
  const lines = content.split('\n');
  let inWhy = false;
  const result: string[] = [];

  for (const line of lines) {
    if (/^## Why\s*$/.test(line)) {
      inWhy = true;
      continue;
    }
    if (inWhy && /^## /.test(line)) {
      break;
    }
    if (inWhy) {
      result.push(line);
    }
  }

  return result.join('\n').trim();
}

// ── extractSpecRequirements ──────────────────────────────────────────────────

export function extractSpecRequirements(
  specFiles: Array<{ name: string; content: string }>
): SpecRequirementGroup[] {
  const results: SpecRequirementGroup[] = [];

  for (const file of specFiles) {
    const requirements: string[] = [];
    const lines = file.content.split('\n');

    for (const line of lines) {
      const match = line.match(/^### Requirement:\s*(.+)$/);
      if (match) {
        requirements.push(match[1].trim());
      }
    }

    if (requirements.length > 0) {
      results.push({ file: file.name, requirements });
    }
  }

  return results;
}

// ── renderHTML ───────────────────────────────────────────────────────────────

export function renderHTML(data: VizData): string {
  const { graph, proposalSummary, specRequirements, state } = data;
  const diagram = buildMermaidDiagram(graph);

  const nodesHtml = graph.nodes.map(node => {
    const nodeState = state?.nodes?.[node.id];
    const statusBadge = nodeState ? `<span class="status status-${nodeState.status}">${nodeState.status}</span>` : '';
    const agentOrCmd = node.agent || node.command || '-';
    const depsStr = node.deps.length > 0 ? node.deps.join(', ') : 'none';
    const scopeStr = node.scope.length > 0 ? node.scope.join(', ') : '-';

    let subTasksHtml = '';
    if (node.sub_tasks && node.sub_tasks.length > 0) {
      subTasksHtml = `
        <div class="sub-tasks">
          <strong>Sub-tasks:</strong>
          <ul>${node.sub_tasks.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
        </div>`;
    }

    return `
      <div class="node-detail" id="detail-${node.id}">
        <h3>${escapeHtml(node.id)} ${statusBadge}</h3>
        <table>
          <tr><td>Type</td><td>${node.type}</td></tr>
          <tr><td>Agent/Command</td><td>${escapeHtml(agentOrCmd)}</td></tr>
          <tr><td>Dependencies</td><td>${escapeHtml(depsStr)}</td></tr>
          <tr><td>Scope</td><td>${escapeHtml(scopeStr)}</td></tr>
        </table>
        ${subTasksHtml}
      </div>`;
  }).join('\n');

  const specsHtml = specRequirements.map(group => `
    <div class="spec-group">
      <h4>${escapeHtml(group.file)}</h4>
      <ul>${group.requirements.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
    </div>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Specwork: ${escapeHtml(graph.change)}</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; padding: 2rem; }
    h1 { color: #58a6ff; margin-bottom: 0.5rem; }
    h2 { color: #8b949e; font-size: 1.1rem; margin-bottom: 1.5rem; border-bottom: 1px solid #21262d; padding-bottom: 0.5rem; }
    h3 { color: #58a6ff; margin-bottom: 0.5rem; }
    h4 { color: #8b949e; margin-bottom: 0.25rem; }
    .panel { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 1.5rem; margin-bottom: 1.5rem; }
    .panel-title { color: #8b949e; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem; }
    .mermaid { background: #0d1117; padding: 1rem; text-align: center; }
    .node-detail { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 1rem; margin-bottom: 0.75rem; }
    .node-detail table { width: 100%; border-collapse: collapse; }
    .node-detail td { padding: 0.25rem 0.5rem; border-bottom: 1px solid #21262d; font-size: 0.9rem; }
    .node-detail td:first-child { color: #8b949e; width: 140px; }
    .sub-tasks ul { margin-left: 1.5rem; margin-top: 0.25rem; }
    .sub-tasks li { margin-bottom: 0.15rem; font-size: 0.9rem; }
    .spec-group { margin-bottom: 1rem; }
    .spec-group ul { margin-left: 1.5rem; }
    .spec-group li { margin-bottom: 0.15rem; font-size: 0.9rem; }
    .status { font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 3px; margin-left: 0.5rem; }
    .status-complete { background: #238636; color: #fff; }
    .status-pending { background: #30363d; color: #8b949e; }
    .status-running { background: #1f6feb; color: #fff; }
    .status-failed { background: #da3633; color: #fff; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(graph.change)}</h1>
  <h2>Created ${graph.created_at}</h2>

  <div class="panel">
    <div class="panel-title">Why this change</div>
    <p>${escapeHtml(proposalSummary)}</p>
  </div>

  <div class="panel">
    <div class="panel-title">Execution Graph</div>
    <div class="mermaid">
${diagram}
    </div>
  </div>

  <div class="grid">
    <div>
      <div class="panel">
        <div class="panel-title">Node Details</div>
        ${nodesHtml}
      </div>
    </div>
    <div>
      <div class="panel">
        <div class="panel-title">Spec Requirements</div>
        ${specsHtml}
      </div>
    </div>
  </div>

  <script>mermaid.initialize({ startOnLoad: true, theme: 'dark' });</script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
