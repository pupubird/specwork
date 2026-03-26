import { parse, stringify } from 'yaml';
import { SpecworkError } from '../utils/errors.js';
import { ExitCode } from '../types/index.js';

export function parseYaml<T>(content: string, sourcePath?: string): T {
  try {
    return parse(content) as T;
  } catch (err) {
    const location = sourcePath ? ` in ${sourcePath}` : '';
    throw new SpecworkError(
      `Failed to parse YAML${location}: ${err instanceof Error ? err.message : String(err)}`,
      ExitCode.ERROR
    );
  }
}

export function stringifyYaml(data: unknown): string {
  try {
    return stringify(data, { lineWidth: 0 });
  } catch (err) {
    throw new SpecworkError(
      `Failed to serialize YAML: ${err instanceof Error ? err.message : String(err)}`,
      ExitCode.ERROR
    );
  }
}
