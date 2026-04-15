import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { MigrationFn } from '../types/migration.js';
import { AGENTS_SPECWORK_VERIFIER } from '../templates/instructions/agents-specwork-verifier.js';
import { AGENTS_SPECWORK_QA } from '../templates/instructions/agents-specwork-qa.js';

export const description = 'Remove scope-check validation rule from agents and active graphs';

export const migrate: MigrationFn = (root, _config) => {
  const details: string[] = [];

  // ── Update verifier agent — remove scope-check reference ──────────────
  const verifierPath = path.join(root, '.claude', 'agents', 'specwork-verifier.md');
  if (fs.existsSync(verifierPath)) {
    const content = fs.readFileSync(verifierPath, 'utf-8');
    if (content.includes('scope-check')) {
      fs.writeFileSync(verifierPath, AGENTS_SPECWORK_VERIFIER, 'utf-8');
      details.push('Updated specwork-verifier.md — removed scope-check');
    }
  }

  // ── Update QA agent — remove scope-check reference ────────────────────
  const qaPath = path.join(root, '.claude', 'agents', 'specwork-qa.md');
  if (fs.existsSync(qaPath)) {
    const content = fs.readFileSync(qaPath, 'utf-8');
    if (content.includes('scope-check')) {
      fs.writeFileSync(qaPath, AGENTS_SPECWORK_QA, 'utf-8');
      details.push('Updated specwork-qa.md — removed scope-check');
    }
  }

  // ── Strip scope-check from active graph validate arrays ───────────────
  const graphDir = path.join(root, '.specwork', 'graph');
  if (fs.existsSync(graphDir)) {
    for (const changeName of fs.readdirSync(graphDir)) {
      const graphPath = path.join(graphDir, changeName, 'graph.yaml');
      if (!fs.existsSync(graphPath)) continue;

      const content = fs.readFileSync(graphPath, 'utf-8');
      if (!content.includes('scope-check')) continue;

      const graph = parseYaml(content);
      if (!graph?.nodes || !Array.isArray(graph.nodes)) continue;

      let changed = false;
      for (const node of graph.nodes) {
        if (!Array.isArray(node.validate)) continue;
        const before = node.validate.length;
        node.validate = node.validate.filter(
          (rule: { type: string }) => rule.type !== 'scope-check',
        );
        if (node.validate.length < before) changed = true;
      }

      if (changed) {
        fs.writeFileSync(graphPath, stringifyYaml(graph), 'utf-8');
        details.push(`Stripped scope-check from graph: ${changeName}`);
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
