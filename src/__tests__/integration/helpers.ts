import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CLI = path.resolve(__dirname, '../../../dist/index.js');

export function createTestProject(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'foreman-int-'));
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  return dir;
}

export function runForeman(cwd: string, args: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI} ${args}`, { cwd, encoding: 'utf-8', stdio: 'pipe' });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (e: any) {
    return { stdout: e.stdout || '', stderr: e.stderr || '', exitCode: e.status || 1 };
  }
}

export function cleanup(dir: string) {
  rmSync(dir, { recursive: true, force: true });
}

export function writeTasksFile(dir: string, change: string, content: string) {
  writeFileSync(path.join(dir, '.foreman', 'changes', change, 'tasks.md'), content);
}
