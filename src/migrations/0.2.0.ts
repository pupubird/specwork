import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { MigrationFn } from '../types/migration.js';
import { SKILLS_SPECWORK_ENGINE_SKILL } from '../templates/instructions/skills-specwork-engine-SKILL.js';
import { AGENTS_SPECWORK_SUMMARIZER } from '../templates/instructions/agents-specwork-summarizer.js';
import { COMMANDS_SPECWORK_PLAN } from '../templates/instructions/commands-specwork-plan.js';

export const description = 'Execution model v2: state machine SKILL.md, max_concurrent config, group-aware summarizer, plan visualization';

export const migrate: MigrationFn = (root, _config) => {
  const details: string[] = [];

  // 1. Rewrite SKILL.md from prose to state machine table
  const skillPath = path.join(root, '.claude', 'skills', 'specwork-engine', 'SKILL.md');
  if (fs.existsSync(skillPath)) {
    const content = fs.readFileSync(skillPath, 'utf-8');
    // Detect old prose-based SKILL.md (has numbered steps or "Step-by-step" section)
    if (content.includes('Step-by-step') || content.includes('## How It Works') || !content.includes('ready_queue')) {
      fs.writeFileSync(skillPath, SKILLS_SPECWORK_ENGINE_SKILL, 'utf-8');
      details.push('Rewrote specwork-engine SKILL.md: prose → state machine table');
    }
  }

  // 2. Add max_concurrent to config.yaml if missing
  const configPath = path.join(root, '.specwork', 'config.yaml');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = parseYaml(raw) as Record<string, unknown>;
    const execution = config.execution as Record<string, unknown> | undefined;

    if (execution && !('max_concurrent' in execution)) {
      execution.max_concurrent = 5;
      fs.writeFileSync(configPath, stringifyYaml(config), 'utf-8');
      details.push('Added max_concurrent: 5 to config.yaml execution block');
    }

    // Remove dead parallel_mode if present
    if (execution && 'parallel_mode' in execution) {
      delete execution.parallel_mode;
      fs.writeFileSync(configPath, stringifyYaml(config), 'utf-8');
      details.push('Removed deprecated parallel_mode from config.yaml');
    }
  }

  // 3. Update summarizer agent for group-level awareness
  const summarizerPath = path.join(root, '.claude', 'agents', 'specwork-summarizer.md');
  if (fs.existsSync(summarizerPath)) {
    const content = fs.readFileSync(summarizerPath, 'utf-8');
    if (!content.includes('sub_tasks') && !content.includes('group-level')) {
      fs.writeFileSync(summarizerPath, AGENTS_SPECWORK_SUMMARIZER, 'utf-8');
      details.push('Updated specwork-summarizer.md with group-level summarization instructions');
    }
  }

  // 4. Update specwork-plan.md to include viz step in step 4
  const planSkillPath = path.join(root, '.claude', 'commands', 'specwork-plan.md');
  if (fs.existsSync(planSkillPath)) {
    const content = fs.readFileSync(planSkillPath, 'utf-8');
    if (!content.includes('specwork viz')) {
      fs.writeFileSync(planSkillPath, COMMANDS_SPECWORK_PLAN, 'utf-8');
      details.push('Updated specwork-plan.md: added specwork viz step to step 4');
    }
  }

  return {
    changed: details.length > 0,
    details: details.length > 0 ? details : undefined,
  };
};
