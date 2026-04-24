import fs from 'node:fs';
import path from 'node:path';
import type { MigrationFn } from '../types/migration.js';
import { AGENTS_SPECWORK_IMPLEMENTER } from '../templates/instructions/agents-specwork-implementer.js';
import { AGENTS_SPECWORK_TEST_WRITER } from '../templates/instructions/agents-specwork-test-writer.js';
import { AGENTS_SPECWORK_QA } from '../templates/instructions/agents-specwork-qa.js';
import { AGENTS_SPECWORK_PLANNER } from '../templates/instructions/agents-specwork-planner.js';
import { COMMANDS_SPECWORK_GO } from '../templates/instructions/commands-specwork-go.js';
import { SKILLS_SPECWORK_ENGINE_SKILL } from '../templates/instructions/skills-specwork-engine-SKILL.js';

export const description = 'Anti-deferral enforcement: agent instructions and per-node QA wiring';

export const migrate: MigrationFn = (root, _config) => {
  const details: string[] = [];

  // ── Agent files: update if missing anti-deferral rules ───────────────────

  const agentUpdates: Array<{
    file: string;
    template: string;
    label: string;
    detectOutdated: (content: string) => boolean;
  }> = [
    {
      file: path.join(root, '.claude', 'agents', 'specwork-implementer.md'),
      template: AGENTS_SPECWORK_IMPLEMENTER,
      label: 'specwork-implementer.md',
      detectOutdated: (c) => !c.includes('Never defer work') || !c.includes('Stop and report'),
    },
    {
      file: path.join(root, '.claude', 'agents', 'specwork-test-writer.md'),
      template: AGENTS_SPECWORK_TEST_WRITER,
      label: 'specwork-test-writer.md',
      detectOutdated: (c) => !c.includes('No stub tests') || !c.includes('test.skip'),
    },
    {
      file: path.join(root, '.claude', 'agents', 'specwork-qa.md'),
      template: AGENTS_SPECWORK_QA,
      label: 'specwork-qa.md',
      detectOutdated: (c) => !c.includes('TODO/FIXME/HACK/stub/placeholder') || !c.includes('automatic FAIL'),
    },
    {
      file: path.join(root, '.claude', 'agents', 'specwork-planner.md'),
      template: AGENTS_SPECWORK_PLANNER,
      label: 'specwork-planner.md',
      detectOutdated: (c) => !c.includes('No deferred tasks') || !c.includes('Explicit file paths required'),
    },
  ];

  for (const { file, template, label, detectOutdated } of agentUpdates) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (detectOutdated(content)) {
        fs.writeFileSync(file, template, 'utf-8');
        details.push(`Updated ${label} with anti-deferral rules`);
      }
    }
  }

  // ── specwork-go.md: update if missing Patience Rule / Node Verification Protocol ──

  const goPath = path.join(root, '.claude', 'commands', 'specwork-go.md');
  if (fs.existsSync(goPath)) {
    const content = fs.readFileSync(goPath, 'utf-8');
    if (!content.includes('Patience Rule') || !content.includes('Node Verification Protocol')) {
      fs.writeFileSync(goPath, COMMANDS_SPECWORK_GO, 'utf-8');
      details.push('Updated specwork-go.md with Patience Rule and Node Verification Protocol');
    }
  }

  // ── SKILL.md: update if missing wave QA states ─────────────────────────

  const skillPath = path.join(root, '.claude', 'skills', 'specwork-engine', 'SKILL.md');
  if (fs.existsSync(skillPath)) {
    const content = fs.readFileSync(skillPath, 'utf-8');
    if (!content.includes('wave:await-qa') || content.includes('go:final-review') || content.includes('specwork-summarizer')) {
      fs.writeFileSync(skillPath, SKILLS_SPECWORK_ENGINE_SKILL, 'utf-8');
      details.push('Updated specwork-engine SKILL.md with wave QA wiring');
    }
  }

  return {
    changed: details.length > 0,
    details: details.length > 0 ? details : undefined,
  };
};
