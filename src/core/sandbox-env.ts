import fs from 'node:fs';
import path from 'node:path';
import type { EnvConfig } from '../types/sandbox.js';

export async function generateEnvFile(rootDir: string, config: EnvConfig): Promise<void> {
  const templatePath = path.join(rootDir, config.template);

  if (!fs.existsSync(templatePath)) {
    return;
  }

  const templateContent = fs.readFileSync(templatePath, 'utf-8');
  const merged: Record<string, string> = {};

  for (const line of templateContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1);
    merged[key] = value;
  }

  for (const [key, value] of Object.entries(config.defaults)) {
    merged[key] = value;
  }

  const lines = Object.entries(merged).map(([k, v]) => `${k}=${v}`).join('\n');
  const output = lines ? lines + '\n' : '';

  const outputPath = path.join(rootDir, config.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf-8');
}

export async function propagateOutputs(
  outputs: Record<string, string>,
  targets: string[],
  rootDir: string,
): Promise<void> {
  if (targets.length === 0) return;

  const lines = Object.entries(outputs)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const content = lines ? lines + '\n' : '';

  for (const target of targets) {
    const targetPath = path.join(rootDir, target);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, 'utf-8');
  }
}
