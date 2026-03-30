import fs from 'node:fs';
import path from 'node:path';
import type { MigrationFn } from '../types/migration.js';
import { AGENTS_SPECWORK_IMPLEMENTER } from '../templates/instructions/agents-specwork-implementer.js';
import { AGENTS_SPECWORK_TEST_WRITER } from '../templates/instructions/agents-specwork-test-writer.js';
import { AGENTS_SPECWORK_PLANNER } from '../templates/instructions/agents-specwork-planner.js';
import { SKILLS_SPECWORK_CONTEXT_SKILL } from '../templates/instructions/skills-specwork-context-SKILL.js';
import { COMMANDS_SPECWORK_PLAN } from '../templates/instructions/commands-specwork-plan.js';

export const description = 'Remove environment snapshot feature: delete snapshot skill, update agent/context instructions, clean config';

export const migrate: MigrationFn = (root, _config) => {
  const details: string[] = [];

  // ── Remove specwork-snapshot skill directory ────────────────────────────
  const snapshotSkillDir = path.join(root, '.claude', 'skills', 'specwork-snapshot');
  if (fs.existsSync(snapshotSkillDir)) {
    fs.rmSync(snapshotSkillDir, { recursive: true, force: true });
    details.push('Removed .claude/skills/specwork-snapshot/ directory');
  }

  // ── Remove .specwork/env/snapshot.md if it exists ──────────────────────
  const snapshotFile = path.join(root, '.specwork', 'env', 'snapshot.md');
  if (fs.existsSync(snapshotFile)) {
    fs.unlinkSync(snapshotFile);
    details.push('Removed .specwork/env/snapshot.md');
  }

  // ── Update agent/skill/command files that still reference snapshot ─────
  const fileUpdates: Array<{
    file: string;
    template: string;
    label: string;
    detectOutdated: (content: string) => boolean;
  }> = [
    {
      file: path.join(root, '.claude', 'agents', 'specwork-implementer.md'),
      template: AGENTS_SPECWORK_IMPLEMENTER,
      label: 'specwork-implementer.md',
      detectOutdated: (c) => c.includes('snapshot') || c.includes('environment snapshot'),
    },
    {
      file: path.join(root, '.claude', 'agents', 'specwork-test-writer.md'),
      template: AGENTS_SPECWORK_TEST_WRITER,
      label: 'specwork-test-writer.md',
      detectOutdated: (c) =>
        c.includes('snapshot') ||
        c.includes('environment snapshot') ||
        !c.includes('real browser testing required') ||
        !c.includes('Core Philosophy'),
    },
    {
      file: path.join(root, '.claude', 'agents', 'specwork-planner.md'),
      template: AGENTS_SPECWORK_PLANNER,
      label: 'specwork-planner.md',
      detectOutdated: (c) => c.includes('snapshot') || c.includes('Environment snapshot'),
    },
    {
      file: path.join(root, '.claude', 'skills', 'specwork-context', 'SKILL.md'),
      template: SKILLS_SPECWORK_CONTEXT_SKILL,
      label: 'specwork-context/SKILL.md',
      detectOutdated: (c) => c.includes('snapshot') || c.includes('Snapshot'),
    },
    {
      file: path.join(root, '.claude', 'commands', 'specwork-plan.md'),
      template: COMMANDS_SPECWORK_PLAN,
      label: 'specwork-plan.md',
      detectOutdated: (c) => c.includes('snapshot') || c.includes('Snapshot'),
    },
  ];

  for (const { file, template, label, detectOutdated } of fileUpdates) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (detectOutdated(content)) {
        fs.writeFileSync(file, template, 'utf-8');
        details.push(`Updated ${label} — removed snapshot references`);
      }
    }
  }

  // ── Remove snapshot_refresh from config.yaml ───────────────────────────
  const configPath = path.join(root, '.specwork', 'config.yaml');
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf-8');
    if (content.includes('snapshot_refresh')) {
      const updated = content
        .split('\n')
        .filter(line => !line.includes('snapshot_refresh'))
        .join('\n');
      fs.writeFileSync(configPath, updated, 'utf-8');
      details.push('Removed snapshot_refresh from config.yaml');
    }
  }

  return {
    changed: details.length > 0,
    details: details.length > 0 ? details : undefined,
  };
};
