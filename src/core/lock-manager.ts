import fs from 'node:fs';
import path from 'node:path';
import { stringifyYaml, parseYaml } from '../io/yaml.js';
import { ensureDir } from '../io/filesystem.js';
import type { LockInfo } from '../types/state.js';

interface LockFile {
  pid: number;
  acquired_at: string;
}

/**
 * Write a lock file with the current PID and timestamp.
 * Returns true on success, false if a lock already exists.
 */
export function acquireLock(lockFilePath: string): boolean {
  if (fs.existsSync(lockFilePath)) {
    return false;
  }
  ensureDir(path.dirname(lockFilePath));
  const data: LockFile = {
    pid: process.pid,
    acquired_at: new Date().toISOString(),
  };
  fs.writeFileSync(lockFilePath, stringifyYaml(data), 'utf8');
  return true;
}

/**
 * Remove the lock file. Safe to call even if lock doesn't exist.
 */
export function releaseLock(lockFilePath: string): void {
  if (fs.existsSync(lockFilePath)) {
    fs.unlinkSync(lockFilePath);
  }
}

/**
 * Check the lock file and whether the owning process is still alive.
 * Returns: { locked: false } if no lock, or { locked: true, stale, info } if locked.
 * A lock is stale if the process with that PID is no longer running.
 */
export function checkLock(lockFilePath: string): {
  locked: boolean;
  stale: boolean;
  info?: LockInfo;
} {
  if (!fs.existsSync(lockFilePath)) {
    return { locked: false, stale: false };
  }

  let data: LockFile;
  try {
    const content = fs.readFileSync(lockFilePath, 'utf8');
    data = parseYaml<LockFile>(content, lockFilePath);
  } catch {
    // Corrupt lock file — treat as stale
    return { locked: true, stale: true };
  }

  const info: LockInfo = { pid: data.pid, acquired_at: data.acquired_at };
  const stale = !isProcessRunning(data.pid);

  return { locked: true, stale, info };
}

/**
 * Overwrite any existing lock with the current PID. Used for force-unlock scenarios.
 */
export function forceLock(lockFilePath: string): void {
  ensureDir(path.dirname(lockFilePath));
  const data: LockFile = {
    pid: process.pid,
    acquired_at: new Date().toISOString(),
  };
  fs.writeFileSync(lockFilePath, stringifyYaml(data), 'utf8');
}

/**
 * Check whether a process with the given PID is still running.
 * Uses signal 0 (no-op) to probe without killing.
 */
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
