import fs from 'node:fs';
import path from 'node:path';
import { scopePath } from '../utils/paths.js';
import { ensureDir } from '../io/filesystem.js';

/**
 * Write scope paths to .foreman/.current-scope (one path per line).
 * Subsequent writes by Write/Edit hooks will be checked against these prefixes.
 */
export function setScope(root: string, paths: string[]): void {
  const file = scopePath(root);
  ensureDir(path.dirname(file));
  // Normalize to absolute paths relative to root
  const normalized = paths.map(p => (path.isAbsolute(p) ? p : path.join(root, p)));
  fs.writeFileSync(file, normalized.join('\n') + '\n', 'utf8');
}

/**
 * Remove the current scope file. After this call all writes are unrestricted.
 */
export function clearScope(root: string): void {
  const file = scopePath(root);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}

/**
 * Return true if filePath starts with any of the scope patterns.
 * If no scope file exists, all paths are considered in scope (unrestricted).
 */
export function checkScope(root: string, filePath: string): boolean {
  const file = scopePath(root);
  if (!fs.existsSync(file)) {
    return true; // no scope = unrestricted
  }

  const patterns = getScope(root);
  if (patterns.length === 0) {
    return true;
  }

  const absFilePath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);

  return patterns.some(pattern => absFilePath.startsWith(pattern));
}

/**
 * Read current scope entries. Returns empty array if no scope file exists.
 */
export function getScope(root: string): string[] {
  const file = scopePath(root);
  if (!fs.existsSync(file)) {
    return [];
  }
  const content = fs.readFileSync(file, 'utf8');
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}
