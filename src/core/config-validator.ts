import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { SpecworkError } from '../utils/errors.js';
import { ExitCode } from '../types/index.js';

/**
 * Validates the .specwork/config.yaml if it exists.
 * Called in the CLI preAction hook — runs before every command (except init).
 */
export function validateConfig(): void {
  const configPath = path.join(process.cwd(), '.specwork', 'config.yaml');
  if (!fs.existsSync(configPath)) return; // No config = no validation needed

  let config: Record<string, unknown>;
  try {
    config = parseYaml(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return; // Parse errors handled elsewhere
  }

  // Validate: verify: none is not allowed
  const execution = config.execution as Record<string, unknown> | undefined;
  if (execution?.verify === 'none') {
    throw new SpecworkError(
      'verify: none is not allowed. Verification is mandatory. Use \'strict\' or \'gates\'.',
      ExitCode.ERROR
    );
  }
}
