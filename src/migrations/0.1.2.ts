import fs from 'node:fs';
import path from 'node:path';
import type { MigrationFn } from '../types/migration.js';

export const description = 'Remove scope-guard hook and related files';

export const migrate: MigrationFn = (root, _config) => {
  const details: string[] = [];

  // 1. Remove .claude/hooks/scope-guard.sh if it exists
  const scopeGuardPath = path.join(root, '.claude', 'hooks', 'scope-guard.sh');
  if (fs.existsSync(scopeGuardPath)) {
    fs.unlinkSync(scopeGuardPath);
    details.push('Removed .claude/hooks/scope-guard.sh');
  }

  // 2. Remove .specwork/.current-scope if it exists
  const currentScopePath = path.join(root, '.specwork', '.current-scope');
  if (fs.existsSync(currentScopePath)) {
    fs.unlinkSync(currentScopePath);
    details.push('Removed .specwork/.current-scope');
  }

  // 3. Remove PreToolUse scope-guard entry from plugin.json
  const pluginPath = path.join(root, 'plugin.json');
  if (fs.existsSync(pluginPath)) {
    try {
      const raw = fs.readFileSync(pluginPath, 'utf-8');
      const plugin = JSON.parse(raw);

      if (plugin.hooks?.PreToolUse) {
        const filtered = plugin.hooks.PreToolUse.filter(
          (h: string) => !h.includes('scope-guard'),
        );

        if (filtered.length < plugin.hooks.PreToolUse.length) {
          if (filtered.length === 0) {
            delete plugin.hooks.PreToolUse;
          } else {
            plugin.hooks.PreToolUse = filtered;
          }
          fs.writeFileSync(pluginPath, JSON.stringify(plugin, null, 2) + '\n', 'utf-8');
          details.push('Removed scope-guard from plugin.json PreToolUse hooks');
        }
      }
    } catch {
      // If plugin.json is malformed, skip — don't break the migration
    }
  }

  // 4. Clean up implementer agent if it still references scope-guard
  const implAgentPath = path.join(root, '.claude', 'agents', 'specwork-implementer.md');
  if (fs.existsSync(implAgentPath)) {
    const content = fs.readFileSync(implAgentPath, 'utf-8');
    if (content.includes('scope-guard')) {
      const updated = content
        .replace(/^\d+\.\s*ONLY modify files within your scope.*scope-guard.*\n/gm, '')
        .replace(/## Rules\n([\s\S]*?)(?=\n##|\n$)/g, (_match, rules: string) => {
          // Renumber remaining rules
          let num = 0;
          const renumbered = rules.replace(/^\d+\./gm, () => `${++num}.`);
          return `## Rules\n${renumbered}`;
        });
      fs.writeFileSync(implAgentPath, updated, 'utf-8');
      details.push('Removed scope-guard reference from specwork-implementer.md');
    }
  }

  return {
    changed: details.length > 0,
    details: details.length > 0 ? details : undefined,
  };
};
