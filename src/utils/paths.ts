import path from 'node:path';
import fs from 'node:fs';
import { SpecworkError } from './errors.js';
import { ExitCode } from '../types/index.js';

/**
 * Walk up from `from` (default: cwd) until we find a directory containing `.specwork/`.
 * Returns the project root (the directory that contains `.specwork/`).
 */
export function findSpecworkRoot(from?: string): string {
  let current = path.resolve(from ?? process.cwd());
  const { root } = path.parse(current);

  while (current !== root) {
    if (fs.existsSync(path.join(current, '.specwork'))) {
      return current;
    }
    current = path.dirname(current);
  }

  throw new SpecworkError(
    'Could not find Specwork project root (.specwork/ directory not found in any parent directory). Did you run `specwork init`?',
    ExitCode.ERROR
  );
}

export function graphDir(root: string, change: string): string {
  return path.join(root, '.specwork', 'graph', change);
}

export function nodesDir(root: string, change: string): string {
  return path.join(root, '.specwork', 'nodes', change);
}

export function nodeDir(root: string, change: string, node: string): string {
  return path.join(root, '.specwork', 'nodes', change, node);
}

export function changeDir(root: string, change: string): string {
  return path.join(root, '.specwork', 'changes', change);
}

export function configPath(root: string): string {
  return path.join(root, '.specwork', 'config.yaml');
}

export function statePath(root: string, change: string): string {
  return path.join(root, '.specwork', 'graph', change, 'state.yaml');
}

export function graphPath(root: string, change: string): string {
  return path.join(root, '.specwork', 'graph', change, 'graph.yaml');
}

export function currentNodePath(root: string): string {
  return path.join(root, '.specwork', '.current-node');
}

export function lockPath(root: string, change: string): string {
  return path.join(root, '.specwork', 'graph', change, '.lock');
}

export function snapshotPath(root: string): string {
  return path.join(root, '.specwork', 'env', 'snapshot.md');
}

export function archiveChangeDir(root: string, change: string): string {
  return path.join(root, '.specwork', 'changes', 'archive', change);
}
