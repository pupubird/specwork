import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { MigrationFn } from '../types/migration.js';
import { AGENTS_SPECWORK_QA } from '../templates/instructions/agents-specwork-qa.js';

export const description = 'Prompt-and-status-only refactor: remove CLI-side verification checks and validate arrays';

export const migrate: MigrationFn = (root, _config) => {
  const details: string[] = [];

  // ── Update QA agent to agent-driven model ─────────────────────────────
  const qaPath = path.join(root, '.claude', 'agents', 'specwork-qa.md');
  if (fs.existsSync(qaPath)) {
    fs.writeFileSync(qaPath, AGENTS_SPECWORK_QA, 'utf-8');
    details.push('Updated specwork-qa.md to agent-driven verification model');
  }

  // ── Strip validate arrays from active graph.yaml files ───────────────
  const graphDir = path.join(root, '.specwork', 'graph');
  if (fs.existsSync(graphDir)) {
    for (const changeName of fs.readdirSync(graphDir)) {
      const graphPath = path.join(graphDir, changeName, 'graph.yaml');
      if (!fs.existsSync(graphPath)) continue;

      const content = fs.readFileSync(graphPath, 'utf-8');
      const graph = parseYaml(content);
      if (!graph?.nodes || !Array.isArray(graph.nodes)) continue;

      let changed = false;
      for (const node of graph.nodes) {
        if ('validate' in node) {
          delete node.validate;
          changed = true;
        }
      }

      if (changed) {
        fs.writeFileSync(graphPath, stringifyYaml(graph), 'utf-8');
        details.push(`Removed validate arrays from graph: ${changeName}`);
      }
    }
  }

  // ── Update config.yaml version ────────────────────────────────────────
  const configPath = path.join(root, '.specwork', 'config.yaml');
  if (fs.existsSync(configPath)) {
    let content = fs.readFileSync(configPath, 'utf-8');
    if (content.includes('specwork_version: 0.2.5') || content.includes("specwork_version: '0.2.5'")) {
      content = content.replace(/specwork_version:\s*['"]?0\.2\.5['"]?/, 'specwork_version: 0.2.6');
      fs.writeFileSync(configPath, content, 'utf-8');
      details.push('Updated specwork_version to 0.2.6 in config.yaml');
    }
  }

  return {
    changed: details.length > 0,
    details: details.length > 0 ? details : undefined,
  };
};
