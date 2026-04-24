import fs from 'node:fs';
import path from 'node:path';
import type { MigrationFn } from '../types/migration.js';
import { AGENTS_SPECWORK_TEST_WRITER } from '../templates/instructions/agents-specwork-test-writer.js';
import { SKILLS_SPECWORK_ENGINE_SKILL } from '../templates/instructions/skills-specwork-engine-SKILL.js';

export const description = 'Integrate sandbox into specwork go lifecycle, sandbox-aware E2E test writer, baseline-aware validation';

export const migrate: MigrationFn = (root, _config) => {
  const details: string[] = [];

  // ── Update test-writer agent — sandbox-aware E2E focus ────────────────
  const testWriterPath = path.join(root, '.claude', 'agents', 'specwork-test-writer.md');
  if (fs.existsSync(testWriterPath)) {
    const content = fs.readFileSync(testWriterPath, 'utf-8');
    // Detect outdated: missing iterative E2E strategy or sandbox references
    if (
      !content.includes('Iterative Test Writing') ||
      !content.includes('Zero Tolerance Policy') ||
      !content.includes('Tests are the source of truth')
    ) {
      fs.writeFileSync(testWriterPath, AGENTS_SPECWORK_TEST_WRITER, 'utf-8');
      details.push('Updated specwork-test-writer.md — sandbox-aware E2E test strategy');
    }
  }

  // ── Update engine skill — sandbox lifecycle moved to specwork go ──────
  const engineSkillPath = path.join(root, '.claude', 'skills', 'specwork-engine', 'SKILL.md');
  if (fs.existsSync(engineSkillPath)) {
    const content = fs.readFileSync(engineSkillPath, 'utf-8');
    // Detect outdated: still has per-node sandbox init/teardown rows
    if (
      content.includes('sandbox:init') ||
      content.includes('sandbox init PASS') ||
      content.includes('sandbox init FAIL') ||
      content.includes('sandbox:teardown')
    ) {
      fs.writeFileSync(engineSkillPath, SKILLS_SPECWORK_ENGINE_SKILL, 'utf-8');
      details.push('Updated specwork-engine/SKILL.md — sandbox lifecycle moved to specwork go');
    }
  }

  // ── Update config.yaml version ────────────────────────────────────────
  const configPath = path.join(root, '.specwork', 'config.yaml');
  if (fs.existsSync(configPath)) {
    let content = fs.readFileSync(configPath, 'utf-8');
    if (content.includes('specwork_version: 0.2.4') || content.includes("specwork_version: '0.2.4'")) {
      content = content.replace(/specwork_version:\s*['"]?0\.2\.4['"]?/, 'specwork_version: 0.2.5');
      fs.writeFileSync(configPath, content, 'utf-8');
      details.push('Updated specwork_version to 0.2.5 in config.yaml');
    }
  }

  return {
    changed: details.length > 0,
    details: details.length > 0 ? details : undefined,
  };
};
