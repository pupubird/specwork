import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { MigrationFn } from '../types/migration.js';

export const description = 'Wave-level QA lifecycle and sandbox removal: clean obsolete managed files, config, and sandbox artifacts';

export const migrate: MigrationFn = (root, config) => {
  const details: string[] = [];

  const obsoleteAgentFiles = [
    {
      path: path.join(root, '.claude', 'agents', 'specwork-summarizer.md'),
      label: 'specwork-summarizer.md',
    },
    {
      path: path.join(root, '.claude', 'agents', 'specwork-verifier.md'),
      label: 'specwork-verifier.md',
    },
  ];

  for (const agentFile of obsoleteAgentFiles) {
    if (fs.existsSync(agentFile.path)) {
      fs.unlinkSync(agentFile.path);
      details.push(`Removed obsolete ${agentFile.label} agent file`);
    }
  }

  // ── Sandbox removal ──────────────────────────────────────────────────
  const sandboxConfigFile = path.join(root, '.specwork', 'sandbox.yaml');
  if (fs.existsSync(sandboxConfigFile)) {
    fs.unlinkSync(sandboxConfigFile);
    details.push('Removed obsolete .specwork/sandbox.yaml');
  }

  const sandboxRuntimeDir = path.join(root, '.specwork', 'sandbox');
  if (fs.existsSync(sandboxRuntimeDir)) {
    fs.rmSync(sandboxRuntimeDir, { recursive: true, force: true });
    details.push('Removed obsolete .specwork/sandbox/ runtime directory');
  }

  const configPath = path.join(root, '.specwork', 'config.yaml');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = parseYaml(raw) as Record<string, unknown>;
    const models = parsed.models as Record<string, unknown> | undefined;
    const execution = parsed.execution as Record<string, unknown> | undefined;
    let changed = false;

    if (models && typeof models === 'object' && 'summarizer' in models) {
      delete models.summarizer;
      details.push('Removed models.summarizer from config.yaml');
      changed = true;
    }
    if (models && typeof models === 'object' && 'verifier' in models) {
      delete models.verifier;
      details.push('Removed models.verifier from config.yaml');
      changed = true;
    }
    if (execution && typeof execution === 'object' && 'verify' in execution) {
      delete execution.verify;
      details.push('Removed execution.verify from config.yaml');
      changed = true;
    }
    if ('sandbox' in parsed) {
      delete parsed.sandbox;
      details.push('Removed sandbox block from config.yaml');
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(configPath, stringifyYaml(parsed), 'utf-8');
    }
  }

  const mergedModels = config.models as Record<string, unknown> | undefined;
  if (mergedModels && typeof mergedModels === 'object' && 'summarizer' in mergedModels) {
    delete mergedModels.summarizer;
  }
  if (mergedModels && typeof mergedModels === 'object' && 'verifier' in mergedModels) {
    delete mergedModels.verifier;
  }
  const mergedExecution = config.execution as Record<string, unknown> | undefined;
  if (mergedExecution && typeof mergedExecution === 'object' && 'verify' in mergedExecution) {
    delete mergedExecution.verify;
  }
  if ('sandbox' in config) {
    delete (config as Record<string, unknown>).sandbox;
  }

  return {
    changed: details.length > 0,
    details: details.length > 0 ? details : undefined,
  };
};
