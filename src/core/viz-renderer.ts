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

  // Build node summary for slide 5 (file impact)
  const nodesHtml = graph.nodes.map(node => {
    const nodeState = state?.nodes?.[node.id];
    const statusClass = nodeState ? `status-${nodeState.status}` : 'status-pending';
    const agentOrCmd = node.agent || node.command || 'deterministic';
    const scopeStr = node.scope.length > 0 ? node.scope.join(', ') : '—';

    let subTasksHtml = '';
    if (node.sub_tasks && node.sub_tasks.length > 0) {
      subTasksHtml = `<div class="task-chips">${node.sub_tasks.map(t => `<span class="task-chip">${escapeHtml(t)}</span>`).join('')}</div>`;
    }

    return `
          <div class="ft-file">
            <span class="node-dot ${statusClass}"></span>
            <span class="fname">${escapeHtml(node.id)}</span>
            <span class="ft-badge ft-badge-${getNodeClass(node)}">${escapeHtml(node.type)}</span>
            <span class="ft-desc">${escapeHtml(agentOrCmd)}</span>
          </div>
          ${subTasksHtml ? `<div style="padding-left:48px;margin-bottom:4px;">${subTasksHtml}</div>` : ''}`;
  }).join('\n');

  // Count stats
  const totalNodes = graph.nodes.length;
  const implNodes = graph.nodes.filter(n => n.id.startsWith('impl')).length;
  const totalSubTasks = graph.nodes.reduce((sum, n) => sum + (n.sub_tasks?.length || 0), 0);
  const totalReqs = specRequirements.reduce((sum, g) => sum + g.requirements.length, 0);

  // Status counts
  const statusCounts = { complete: 0, running: 0, pending: 0, failed: 0 };
  for (const node of graph.nodes) {
    const s = state?.nodes?.[node.id]?.status || 'pending';
    if (s in statusCounts) statusCounts[s as keyof typeof statusCounts]++;
  }

  // Spec requirements HTML
  const specsHtml = specRequirements.map(group => `
        <div class="spec-group">
          <div class="spec-file-name">${escapeHtml(group.file)}</div>
          ${group.requirements.map(r => `<div class="spec-item"><span class="spec-dot"></span>${escapeHtml(r)}</div>`).join('\n')}
        </div>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Specwork: ${escapeHtml(graph.change)}</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@300;400;500;600;700&display=swap');
    :root {
      --bg:#000;--surface:#0a0a0a;--surface-2:#111;--border:#222;
      --text:#ededed;--text-2:#aaa;--text-3:#666;
      --green:#0d0;--green-dim:#062;--blue:#48f;--blue-dim:#124;
      --red:#f44;--purple:#a6f;--amber:#fa0;
    }
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Geist Mono',monospace;background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased;overflow-x:hidden}
    code{background:var(--surface-2);padding:3px 8px;border-radius:4px;color:var(--text)}

    /* Slide system */
    .slide{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:80px 120px;position:relative;border-bottom:1px solid var(--border)}
    .slide-inner{width:100%;max-width:1100px}
    .slide-number{position:absolute;top:40px;right:48px;font-size:16px;color:var(--text-3)}
    .slide-title{font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:.15em;color:var(--text-3);margin-bottom:40px}

    /* Slide 1 */
    .title-slide{text-align:center}
    .title-slide h1{font-size:48px;font-weight:600;letter-spacing:-.03em;margin-bottom:24px}
    .title-slide .subtitle{font-size:22px;color:var(--text-2);max-width:700px;line-height:1.7;margin:0 auto 56px}
    .title-stats{display:flex;gap:64px;justify-content:center}
    .title-stat .num{font-size:48px;font-weight:600}
    .title-stat .label{font-size:16px;color:var(--text-3);margin-top:4px}

    /* Slide 2 — before/after */
    .comparison{display:grid;grid-template-columns:1fr 80px 1fr;align-items:start}
    .compare-col h3{font-size:18px;text-transform:uppercase;letter-spacing:.12em;margin-bottom:32px}
    .compare-arrow{display:flex;align-items:center;justify-content:center;font-size:36px;color:var(--text-3);padding-top:60px}
    .pain-point{display:flex;align-items:flex-start;gap:16px;padding:16px 0;font-size:20px;color:var(--text-2);line-height:1.6}
    .pain-point .icon{font-size:22px;flex-shrink:0;margin-top:2px}
    .pain-point code{font-size:18px}
    .x-icon{color:var(--red)}
    .check-icon{color:var(--green)}

    /* Slide 3 — how it works */
    .flow-diagram{display:flex;flex-direction:column}
    .flow-step{display:flex;align-items:stretch}
    .flow-line{width:56px;display:flex;flex-direction:column;align-items:center}
    .flow-dot{width:20px;height:20px;border-radius:50%;flex-shrink:0;margin-top:22px}
    .flow-connector{width:2px;flex:1;background:var(--border)}
    .flow-content{flex:1;padding:16px 0 40px 24px}
    .flow-title{font-size:22px;font-weight:500;margin-bottom:6px}
    .flow-desc{font-size:17px;color:var(--text-3)}
    .flow-visual{margin-top:18px}

    /* Slide 4 — experience preview */
    .terminal{background:#0c0c0c;border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:24px}
    .terminal-bar{background:#161616;padding:10px 16px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border)}
    .terminal-dot{width:10px;height:10px;border-radius:50%}
    .terminal-dot-r{background:#f44}.terminal-dot-y{background:#fa0}.terminal-dot-g{background:#0d0}
    .terminal-title{margin-left:8px;font-size:12px;color:var(--text-3)}
    .terminal-body{padding:20px 24px;font-size:15px;line-height:1.8;overflow-x:auto}
    .t-prompt{color:var(--green)}.t-cmd{color:var(--text);font-weight:500}.t-dim{color:var(--text-3)}
    .t-green{color:var(--green)}.t-blue{color:var(--blue)}.t-amber{color:var(--amber)}
    .t-red{color:var(--red)}.t-purple{color:var(--purple)}.t-bold{font-weight:600}
    .t-line{display:block}.t-blank{display:block;height:12px}
    .scene{display:flex;align-items:center;gap:12px;margin-bottom:12px}
    .scene-num{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600;flex-shrink:0}
    .scene-text{font-size:18px;font-weight:500}
    .scene-desc{font-size:14px;color:var(--text-3);margin-left:44px;margin-bottom:16px}
    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px}
    .two-col .terminal{margin-bottom:0}

    /* Browser mockup (for frontend changes) */
    .browser{background:#0c0c0c;border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:24px}
    .browser-bar{background:#161616;padding:10px 16px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border)}
    .browser-url{flex:1;background:#0c0c0c;border:1px solid var(--border);border-radius:6px;padding:6px 14px;font-size:13px;color:var(--text-3);margin-left:8px}
    .browser-body{padding:0;min-height:300px;position:relative}

    /* Dashboard mockup (for infra/monitoring changes) */
    .metrics-row{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px}
    .metric{background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:16px 20px}
    .metric-label{font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
    .metric-value{font-size:28px;font-weight:600}
    .metric-change{font-size:12px;margin-top:4px}

    /* Slide 5 — file impact */
    .impact-layout{display:grid;grid-template-columns:1fr 1fr;gap:48px}
    .file-tree{font-size:17px;line-height:2}
    .ft-dir{color:var(--text-3)}
    .ft-file{display:flex;align-items:center;gap:12px;padding-left:24px}
    .ft-file .fname{color:var(--text-2)}
    .ft-badge{font-size:12px;font-weight:600;padding:2px 10px;border-radius:4px;text-transform:uppercase;letter-spacing:.05em}
    .ft-badge-new,.ft-badge-impl{background:var(--green-dim);color:var(--green);border:1px solid var(--green)}
    .ft-badge-mod,.ft-badge-test{background:var(--blue-dim);color:var(--blue);border:1px solid var(--blue)}
    .ft-badge-snapshot{background:var(--surface-2);color:var(--text-3);border:1px solid var(--text-3)}
    .ft-badge-integration{background:rgba(170,102,255,0.1);color:var(--purple);border:1px solid var(--purple)}
    .ft-desc{color:var(--text-3);font-size:14px;margin-left:auto}
    .impact-legend{display:flex;gap:32px;margin-bottom:32px;font-size:15px}
    .impact-legend-item{display:flex;align-items:center;gap:10px;color:var(--text-2)}
    .impact-stats{display:flex;flex-direction:column;gap:20px}
    .impact-stat-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:24px 28px}
    .impact-stat-card .isc-label{font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px}
    .impact-stat-card .isc-value{font-size:28px;font-weight:600}
    .impact-stat-card .isc-detail{font-size:14px;color:var(--text-3);margin-top:6px;line-height:1.6}
    .scope-bar{display:flex;gap:3px;margin-top:12px;height:8px;border-radius:4px;overflow:hidden}
    .scope-bar-seg{height:100%;border-radius:2px}
    .node-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
    .status-complete{background:var(--green)}.status-running{background:var(--blue);box-shadow:0 0 6px var(--blue)}.status-pending{background:var(--text-3);opacity:.3}.status-failed{background:var(--red)}
    .task-chips{display:flex;flex-wrap:wrap;gap:4px}
    .task-chip{background:var(--surface-2);border:1px solid var(--border);padding:2px 8px;border-radius:3px;font-size:11px;color:var(--text-3)}
    .spec-group{margin-bottom:16px}
    .spec-file-name{color:var(--purple);font-size:14px;font-weight:500;margin-bottom:6px}
    .spec-item{display:flex;align-items:center;gap:10px;padding:4px 0;font-size:14px;color:var(--text-2)}
    .spec-dot{width:5px;height:5px;border-radius:50%;background:var(--purple);flex-shrink:0}

    /* Slide 6 — risks */
    .risk-cards{display:flex;gap:24px}
    .risk-card{flex:1;background:var(--surface);border:1px solid var(--border);border-left:4px solid var(--red);border-radius:0 10px 10px 0;padding:32px}
    .risk-card h4{font-size:20px;font-weight:500;margin-bottom:12px;color:var(--red)}
    .risk-card p{font-size:17px;color:var(--text-2);line-height:1.7}
    .risk-card code{font-size:15px}

    /* Nav */
    .nav-dots{position:fixed;right:28px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:14px;z-index:100}
    .nav-dot{width:8px;height:8px;border-radius:50%;background:var(--text-3);opacity:.3;cursor:pointer;transition:all .2s}
    .nav-dot:hover{opacity:.8}
    .nav-dot.active{opacity:1;background:var(--text);transform:scale(1.8)}
  </style>
</head>
<body>
  <div class="nav-dots">
    <div class="nav-dot active" onclick="document.getElementById('s1').scrollIntoView({behavior:'smooth'})"></div>
    <div class="nav-dot" onclick="document.getElementById('s2').scrollIntoView({behavior:'smooth'})"></div>
    <div class="nav-dot" onclick="document.getElementById('s3').scrollIntoView({behavior:'smooth'})"></div>
    <div class="nav-dot" onclick="document.getElementById('s4').scrollIntoView({behavior:'smooth'})"></div>
    <div class="nav-dot" onclick="document.getElementById('s5').scrollIntoView({behavior:'smooth'})"></div>
    <div class="nav-dot" onclick="document.getElementById('s6').scrollIntoView({behavior:'smooth'})"></div>
  </div>

  <!-- SLIDE 1 — Title -->
  <div class="slide title-slide" id="s1">
    <div class="slide-number">1 / 6</div>
    <div class="slide-inner" style="text-align:center;">
      <h1>${escapeHtml(graph.change)}</h1>
      <div class="subtitle">${escapeHtml(proposalSummary)}</div>
      <div class="title-stats">
        <div class="title-stat"><div class="num" style="color:var(--purple)">${totalReqs}</div><div class="label">requirements</div></div>
        <div class="title-stat"><div class="num" style="color:var(--blue)">${totalNodes}</div><div class="label">nodes</div></div>
        <div class="title-stat"><div class="num" style="color:var(--green)">${totalSubTasks}</div><div class="label">sub-tasks</div></div>
        <div class="title-stat"><div class="num">${specRequirements.length}</div><div class="label">spec files</div></div>
      </div>
    </div>
  </div>

  <!-- SLIDE 2 — The Problem (agent fills in before/after) -->
  <div class="slide" id="s2">
    <div class="slide-number">2 / 6</div>
    <div class="slide-inner">
      <div class="slide-title">The Problem</div>
      <div class="comparison">
        <div class="compare-col">
          <h3 style="color:var(--red)">Today</h3>
          <div class="pain-point"><span class="icon x-icon">✕</span><span><!-- AGENT: describe current pain point 1 --></span></div>
          <div class="pain-point"><span class="icon x-icon">✕</span><span><!-- AGENT: describe current pain point 2 --></span></div>
          <div class="pain-point"><span class="icon x-icon">✕</span><span><!-- AGENT: describe current pain point 3 --></span></div>
        </div>
        <div class="compare-arrow">→</div>
        <div class="compare-col">
          <h3 style="color:var(--green)">After</h3>
          <div class="pain-point"><span class="icon check-icon">✓</span><span><!-- AGENT: describe what changes for point 1 --></span></div>
          <div class="pain-point"><span class="icon check-icon">✓</span><span><!-- AGENT: describe what changes for point 2 --></span></div>
          <div class="pain-point"><span class="icon check-icon">✓</span><span><!-- AGENT: describe what changes for point 3 --></span></div>
        </div>
      </div>
    </div>
  </div>

  <!-- SLIDE 3 — How It Works (agent fills in steps) -->
  <div class="slide" id="s3">
    <div class="slide-number">3 / 6</div>
    <div class="slide-inner">
      <div class="slide-title">How It Works</div>
      <div class="flow-diagram">
        <!-- AGENT: Replace this with 3-5 flow-step blocks showing the key mechanics.
             Each step has a colored dot, title, description, and optional flow-visual.
             Use file-box, merge-box, or other visual elements to make it concrete. -->
        <div class="flow-step">
          <div class="flow-line"><div class="flow-dot" style="background:var(--blue)"></div><div class="flow-connector"></div></div>
          <div class="flow-content">
            <div class="flow-title">Step 1</div>
            <div class="flow-desc"><!-- AGENT: describe --></div>
          </div>
        </div>
        <div class="flow-step">
          <div class="flow-line"><div class="flow-dot" style="background:var(--green)"></div><div class="flow-connector" style="background:transparent"></div></div>
          <div class="flow-content">
            <div class="flow-title">Step 2</div>
            <div class="flow-desc"><!-- AGENT: describe --></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- SLIDE 4 — What You'll See (agent creates experience preview) -->
  <div class="slide" id="s4" style="min-height:auto;padding-top:100px;padding-bottom:100px;">
    <div class="slide-number">4 / 6</div>
    <div class="slide-inner">
      <div class="slide-title">What You'll See</div>
      <!-- AGENT: This is the most important slide. Show the actual user experience.
           Adapt based on what kind of change this is:

           CLI tool → mock terminal sessions showing commands + output
           Frontend → browser wireframes with the UI being built, component states
           Backend API → curl request/response pairs, before/after
           Infrastructure → mock Grafana dashboards with SVG charts, config files
           Library → code examples showing before/after API usage

           Use .terminal for terminal mockups, .browser for browser mockups,
           .metrics-row for dashboard mockups. Show 2-4 scenes.
           Each scene has a .scene header with numbered dot + description.
      -->
      <div class="scene">
        <div class="scene-num" style="background:var(--blue-dim);color:var(--blue);border:1px solid var(--blue);">1</div>
        <div class="scene-text"><!-- AGENT: scene title --></div>
      </div>
      <div class="scene-desc"><!-- AGENT: scene description --></div>
      <div class="terminal">
        <div class="terminal-bar">
          <div class="terminal-dot terminal-dot-r"></div>
          <div class="terminal-dot terminal-dot-y"></div>
          <div class="terminal-dot terminal-dot-g"></div>
          <div class="terminal-title"><!-- AGENT: terminal title --></div>
        </div>
        <div class="terminal-body">
          <!-- AGENT: fill with realistic mock output -->
        </div>
      </div>
    </div>
  </div>

  <!-- SLIDE 5 — What Changes In Your Codebase -->
  <div class="slide" id="s5">
    <div class="slide-number">5 / 6</div>
    <div class="slide-inner">
      <div class="slide-title">What Changes In Your Codebase</div>
      <div class="impact-layout">
        <div>
          <div class="file-tree">
            <div class="ft-dir">Nodes</div>
            ${nodesHtml}
          </div>
        </div>
        <div class="impact-stats">
          <div class="impact-stat-card">
            <div class="isc-label">Nodes</div>
            <div class="isc-value">${totalNodes}</div>
            <div class="isc-detail">${implNodes} impl · ${statusCounts.complete} complete · ${statusCounts.running} running · ${statusCounts.pending} pending</div>
            <div class="scope-bar">
              <div class="scope-bar-seg" style="flex:${statusCounts.complete};background:var(--green)"></div>
              <div class="scope-bar-seg" style="flex:${statusCounts.running};background:var(--blue)"></div>
              <div class="scope-bar-seg" style="flex:${statusCounts.pending};background:var(--text-3);opacity:.3"></div>
            </div>
          </div>
          <div class="impact-stat-card">
            <div class="isc-label">Spec Coverage</div>
            <div class="isc-value" style="color:var(--purple)">${totalReqs} requirements</div>
            <div class="isc-detail">${specRequirements.length} spec file${specRequirements.length === 1 ? '' : 's'}</div>
            ${specsHtml}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- SLIDE 6 — Watch Out For (agent fills in risks) -->
  <div class="slide" id="s6">
    <div class="slide-number">6 / 6</div>
    <div class="slide-inner">
      <div class="slide-title">Watch Out For</div>
      <div class="risk-cards">
        <!-- AGENT: Add 1-3 risk cards based on the change.
             Look for: shared file contention, regression risk, breaking changes,
             external dependencies, performance concerns. -->
        <div class="risk-card">
          <h4><!-- AGENT: risk title --></h4>
          <p><!-- AGENT: risk description --></p>
        </div>
      </div>
    </div>
  </div>

  <script>
    mermaid.initialize({startOnLoad:true,theme:'dark',themeVariables:{darkMode:true,background:'#000',primaryColor:'#48f',primaryTextColor:'#ededed',lineColor:'#444'}});
    const dots=document.querySelectorAll('.nav-dot'),slides=document.querySelectorAll('.slide');
    new IntersectionObserver(e=>{e.forEach(entry=>{if(entry.isIntersecting){const i=Array.from(slides).indexOf(entry.target);dots.forEach((d,j)=>d.classList.toggle('active',j===i))}})},{threshold:.3}).observe&&slides.forEach(s=>new IntersectionObserver(e=>{e.forEach(entry=>{if(entry.isIntersecting){const i=Array.from(slides).indexOf(entry.target);dots.forEach((d,j)=>d.classList.toggle('active',j===i))}})},{threshold:.3}).observe(s));
  </script>
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
