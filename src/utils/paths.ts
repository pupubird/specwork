import path from 'node:path';
import fs from 'node:fs';
import { ForemanError } from './errors.js';
import { ExitCode } from '../types/index.js';

/**
 * Walk up from `from` (default: cwd) until we find a directory containing `.foreman/`.
 * Returns the project root (the directory that contains `.foreman/`).
 */
export function findForemanRoot(from?: string): string {
  let current = path.resolve(from ?? process.cwd());
  const { root } = path.parse(current);

  while (current !== root) {
    if (fs.existsSync(path.join(current, '.foreman'))) {
      return current;
    }
    current = path.dirname(current);
  }

  throw new ForemanError(
    'Could not find Foreman project root (.foreman/ directory not found in any parent directory). Did you run `foreman init`?',
    ExitCode.ERROR
  );
}

export function graphDir(root: string, change: string): string {
  return path.join(root, '.foreman', 'graph', change);
}

export function nodesDir(root: string, change: string): string {
  return path.join(root, '.foreman', 'nodes', change);
}

export function nodeDir(root: string, change: string, node: string): string {
  return path.join(root, '.foreman', 'nodes', change, node);
}

export function changeDir(root: string, change: string): string {
  return path.join(root, '.foreman', 'changes', change);
}

export function configPath(root: string): string {
  return path.join(root, '.foreman', 'config.yaml');
}

export function statePath(root: string, change: string): string {
  return path.join(root, '.foreman', 'graph', change, 'state.yaml');
}

export function graphPath(root: string, change: string): string {
  return path.join(root, '.foreman', 'graph', change, 'graph.yaml');
}

export function scopePath(root: string): string {
  return path.join(root, '.foreman', '.current-scope');
}

export function currentNodePath(root: string): string {
  return path.join(root, '.foreman', '.current-node');
}

export function lockPath(root: string, change: string): string {
  return path.join(root, '.foreman', 'graph', change, '.lock');
}

export function snapshotPath(root: string): string {
  return path.join(root, '.foreman', 'env', 'snapshot.md');
}
