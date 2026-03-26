import { execSync } from 'node:child_process';
import { SpecworkError } from '../utils/errors.js';
import { ExitCode } from '../types/index.js';

function run(command: string, cwd?: string): string {
  try {
    return execSync(command, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SpecworkError(`Git command failed: ${command}\n${msg}`, ExitCode.ERROR);
  }
}

export function commit(message: string, cwd?: string): void {
  run('git add -A', cwd);
  run(`git commit -m ${JSON.stringify(message)}`, cwd);
}

export function diff(ref?: string, cwd?: string): string {
  const refArg = ref ?? 'HEAD~1';
  try {
    return run(`git diff ${refArg}`, cwd);
  } catch {
    // If HEAD~1 doesn't exist (first commit), diff against empty tree
    return run('git diff --cached', cwd);
  }
}

export function isClean(cwd?: string): boolean {
  try {
    const result = run('git status --porcelain', cwd);
    return result.length === 0;
  } catch {
    return false;
  }
}

export function getCurrentBranch(cwd?: string): string {
  try {
    return run('git rev-parse --abbrev-ref HEAD', cwd);
  } catch {
    return 'unknown';
  }
}
