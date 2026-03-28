import fs from 'node:fs';
import path from 'node:path';
import type { MigrationFn } from '../types/migration.js';
import { AGENTS_SPECWORK_SUMMARIZER } from '../templates/instructions/agents-specwork-summarizer.js';
import { AGENTS_SPECWORK_IMPLEMENTER } from '../templates/instructions/agents-specwork-implementer.js';

export const description = 'Micro-spec context engineering: update agents, clean up scope-guard from CLAUDE.md';

export const migrate: MigrationFn = (root, _config) => {
  const details: string[] = [];

  // 1. Update summarizer agent — add L1-structured.json section
  const summarizerPath = path.join(root, '.claude', 'agents', 'specwork-summarizer.md');
  if (fs.existsSync(summarizerPath)) {
    const content = fs.readFileSync(summarizerPath, 'utf-8');
    if (!content.includes('L1-structured.json')) {
      fs.writeFileSync(summarizerPath, AGENTS_SPECWORK_SUMMARIZER, 'utf-8');
      details.push('Updated specwork-summarizer.md with L1-structured.json instructions');
    }
  }

  // 2. Catch-up: ensure implementer agent has no scope-guard references
  //    (0.1.2 migration handles this, but re-sync from template to be safe)
  const implementerPath = path.join(root, '.claude', 'agents', 'specwork-implementer.md');
  if (fs.existsSync(implementerPath)) {
    const content = fs.readFileSync(implementerPath, 'utf-8');
    if (content.includes('scope-guard') || content.includes('scope_guard')) {
      fs.writeFileSync(implementerPath, AGENTS_SPECWORK_IMPLEMENTER, 'utf-8');
      details.push('Re-synced specwork-implementer.md from template (scope-guard cleanup)');
    }
  }

  // 3. Clean up CLAUDE.md — remove scope enforcement rule and scope-guard references
  const claudeMdPath = path.join(root, 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, 'utf-8');
    let updated = content;

    // Remove the scope enforcement rule line (various phrasings)
    updated = updated.replace(
      /^\d+\.\s+\*\*Scope enforcement\*\*[^\n]*\n/gm,
      '',
    );

    // Remove scope-guard from hooks table line
    updated = updated.replace(
      /\(scope-guard,\s*/g,
      '(',
    );
    updated = updated.replace(
      /,\s*scope-guard/g,
      '',
    );
    updated = updated.replace(
      /scope-guard,?\s*/g,
      '',
    );

    // Renumber rules if we removed the scope enforcement line
    if (updated !== content) {
      // Find the ## Rules section and renumber
      updated = updated.replace(
        /(## Rules\n\n)((?:\d+\.\s+\*\*[^\n]+\n)+)/g,
        (_match, header: string, rules: string) => {
          let num = 0;
          const renumbered = rules.replace(/^\d+\./gm, () => `${++num}.`);
          return header + renumbered;
        },
      );

      fs.writeFileSync(claudeMdPath, updated, 'utf-8');
      details.push('Cleaned up CLAUDE.md: removed scope enforcement rule and scope-guard references');
    }
  }

  return {
    changed: details.length > 0,
    details: details.length > 0 ? details : undefined,
  };
};
