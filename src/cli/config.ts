import { Command } from 'commander';
import { findSpecworkRoot, configPath } from '../utils/paths.js';
import { readYaml, writeYaml, exists } from '../io/filesystem.js';
import { output, table } from '../utils/output.js';
import { success, info } from '../utils/logger.js';
import { SpecworkError } from '../utils/errors.js';
import { ExitCode } from '../types/index.js';

// ── dot-path helpers ───────────────────────────────────────────────────────

function getNestedValue(obj: Record<string, unknown>, dotPath: string): unknown {
  const parts = dotPath.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setNestedValue(
  obj: Record<string, unknown>,
  dotPath: string,
  value: unknown
): Record<string, unknown> {
  const parts = dotPath.split('.');
  const result: Record<string, unknown> = { ...obj };

  if (parts.length === 1) {
    result[parts[0]] = value;
    return result;
  }

  const [head, ...rest] = parts;
  const nested = (result[head] != null && typeof result[head] === 'object')
    ? { ...(result[head] as Record<string, unknown>) }
    : {};
  result[head] = setNestedValue(nested, rest.join('.'), value);
  return result;
}

function parseValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  const num = Number(raw);
  if (!isNaN(num) && raw.trim() !== '') return num;
  return raw;
}

// ── specwork config ─────────────────────────────────────────────────────────

export function makeConfigCommand(): Command {
  const configCmd = new Command('config').description('Read and update Specwork configuration');

  // ── specwork config show ───────────────────────────────────────────────────

  configCmd
    .command('show')
    .description('Display the current .specwork/config.yaml')
    .option('--key <dotpath>', 'Show a specific key (dot-separated path)')
    .action((opts: { key?: string }, cmd: Command) => {
      const root = findSpecworkRoot();
      const jsonMode = (cmd.parent?.parent?.opts() as { json?: boolean })?.json ?? false;

      const cp = configPath(root);
      if (!exists(cp)) {
        throw new SpecworkError('No config.yaml found. Run `specwork init` first.', ExitCode.ERROR);
      }

      const config = readYaml<Record<string, unknown>>(cp);

      if (opts.key) {
        const val = getNestedValue(config, opts.key);
        if (val === undefined) {
          throw new SpecworkError(`Key "${opts.key}" not found in config`, ExitCode.ERROR);
        }
        if (jsonMode) {
          output({ key: opts.key, value: val }, { json: true, quiet: false });
        } else {
          info(`${opts.key}: ${JSON.stringify(val)}`);
        }
        return;
      }

      if (jsonMode) {
        output(config, { json: true, quiet: false });
        return;
      }

      // Human-readable: flatten top-level sections
      const rows: string[][] = [];
      for (const [section, val] of Object.entries(config)) {
        if (val != null && typeof val === 'object' && !Array.isArray(val)) {
          for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
            rows.push([`${section}.${k}`, String(v)]);
          }
        } else {
          rows.push([section, String(val)]);
        }
      }
      table(['Key', 'Value'], rows);
    });

  // ── specwork config set ────────────────────────────────────────────────────

  configCmd
    .command('set <key> <value>')
    .description('Set a config value by dot-path (e.g., models.default opus)')
    .action((key: string, rawValue: string, _opts, cmd: Command) => {
      const root = findSpecworkRoot();
      const jsonMode = (cmd.parent?.parent?.opts() as { json?: boolean })?.json ?? false;

      const cp = configPath(root);
      if (!exists(cp)) {
        throw new SpecworkError('No config.yaml found. Run `specwork init` first.', ExitCode.ERROR);
      }

      const config = readYaml<Record<string, unknown>>(cp);
      const value = parseValue(rawValue);
      const updated = setNestedValue(config, key, value);

      writeYaml(cp, updated);

      if (jsonMode) {
        output({ key, value }, { json: true, quiet: false });
      } else {
        success(`Config updated: ${key} = ${JSON.stringify(value)}`);
      }
    });

  return configCmd;
}
