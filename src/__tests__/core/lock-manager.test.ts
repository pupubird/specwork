import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquireLock, releaseLock, checkLock, forceLock } from '../../core/lock-manager.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'foreman-lock-test-'));
}

function rmDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── acquireLock ───────────────────────────────────────────────────────────────

describe('acquireLock', () => {
  let dir: string;
  let lockFile: string;

  beforeEach(() => {
    dir = makeTempDir();
    lockFile = path.join(dir, '.lock');
  });
  afterEach(() => rmDir(dir));

  it('returns true and creates lock file on first acquire', () => {
    const result = acquireLock(lockFile);
    expect(result).toBe(true);
    expect(fs.existsSync(lockFile)).toBe(true);
  });

  it('writes PID and acquired_at to lock file', () => {
    acquireLock(lockFile);
    const content = fs.readFileSync(lockFile, 'utf8');
    expect(content).toContain(String(process.pid));
    expect(content).toContain('acquired_at');
  });

  it('returns false if lock already exists', () => {
    acquireLock(lockFile);
    const second = acquireLock(lockFile);
    expect(second).toBe(false);
  });

  it('creates parent directory if missing', () => {
    const nested = path.join(dir, 'sub', 'dir', '.lock');
    expect(acquireLock(nested)).toBe(true);
    expect(fs.existsSync(nested)).toBe(true);
  });
});

// ── releaseLock ───────────────────────────────────────────────────────────────

describe('releaseLock', () => {
  let dir: string;
  let lockFile: string;

  beforeEach(() => {
    dir = makeTempDir();
    lockFile = path.join(dir, '.lock');
  });
  afterEach(() => rmDir(dir));

  it('removes the lock file', () => {
    acquireLock(lockFile);
    releaseLock(lockFile);
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it('does not throw if lock file does not exist', () => {
    expect(() => releaseLock(lockFile)).not.toThrow();
  });
});

// ── checkLock ─────────────────────────────────────────────────────────────────

describe('checkLock', () => {
  let dir: string;
  let lockFile: string;

  beforeEach(() => {
    dir = makeTempDir();
    lockFile = path.join(dir, '.lock');
  });
  afterEach(() => rmDir(dir));

  it('returns { locked: false } when no lock file', () => {
    const result = checkLock(lockFile);
    expect(result.locked).toBe(false);
    expect(result.stale).toBe(false);
    expect(result.info).toBeUndefined();
  });

  it('returns { locked: true, stale: false } for active lock (current process)', () => {
    acquireLock(lockFile);
    const result = checkLock(lockFile);
    expect(result.locked).toBe(true);
    expect(result.stale).toBe(false); // current process is still running
    expect(result.info?.pid).toBe(process.pid);
  });

  it('returns { locked: true, stale: true } for lock with dead PID', () => {
    // Write a lock file with a PID that cannot exist (> 4M on most systems)
    const deadLock = { pid: 9_999_999, acquired_at: new Date().toISOString() };
    fs.writeFileSync(lockFile, `pid: ${deadLock.pid}\nacquired_at: "${deadLock.acquired_at}"\n`, 'utf8');

    const result = checkLock(lockFile);
    expect(result.locked).toBe(true);
    expect(result.stale).toBe(true);
    expect(result.info?.pid).toBe(9_999_999);
  });

  it('returns stale for corrupt lock file', () => {
    fs.writeFileSync(lockFile, 'not: valid: yaml: [[[', 'utf8');
    const result = checkLock(lockFile);
    expect(result.locked).toBe(true);
    expect(result.stale).toBe(true);
  });

  it('includes acquired_at in info', () => {
    acquireLock(lockFile);
    const result = checkLock(lockFile);
    expect(result.info?.acquired_at).toBeTruthy();
  });
});

// ── forceLock ─────────────────────────────────────────────────────────────────

describe('forceLock', () => {
  let dir: string;
  let lockFile: string;

  beforeEach(() => {
    dir = makeTempDir();
    lockFile = path.join(dir, '.lock');
  });
  afterEach(() => rmDir(dir));

  it('creates lock file even if none exists', () => {
    forceLock(lockFile);
    expect(fs.existsSync(lockFile)).toBe(true);
  });

  it('overwrites an existing lock with current PID', () => {
    // Write a stale lock with dead PID
    fs.writeFileSync(lockFile, 'pid: 9999999\nacquired_at: "2020-01-01"\n', 'utf8');
    forceLock(lockFile);

    const result = checkLock(lockFile);
    expect(result.info?.pid).toBe(process.pid);
    expect(result.stale).toBe(false);
  });

  it('after forceLock, acquireLock returns false (lock is held)', () => {
    forceLock(lockFile);
    expect(acquireLock(lockFile)).toBe(false);
  });
});
