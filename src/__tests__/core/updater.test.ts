/**
 * Unit tests for the specwork updater core logic.
 *
 * RED state: src/core/updater.ts does not exist yet — all tests must fail on import.
 *
 * Covers spec requirements:
 *   1. Version Tracking
 *   2. Manifest-Based Modification Detection
 *   3. Backup Before Overwrite
 *   4. Config Schema Migration
 *   5. Lock-File Workflow Protection
 *   6. Dry-Run Mode
 *   9. Update Summary Output
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';

import {
  computeFileChecksum,
  generateManifest,
  loadManifest,
  writeManifest,
  classifyFiles,
  backupFiles,
  deepMergeConfig,
  checkLockedWorkflows,
  runUpdate,
} from '../../core/updater.js';

import type {
  FileClassification,
  UpdateResult,
} from '../../types/common.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-updater-'));
}

function initSpecwork(root: string, opts: { version?: string } = {}): void {
  const dirs = [
    '.specwork/env',
    '.specwork/graph',
    '.specwork/nodes',
    '.specwork/specs',
    '.specwork/changes/archive',
    '.specwork/templates',
    '.specwork/backups',
  ];
  for (const d of dirs) {
    fs.mkdirSync(path.join(root, d), { recursive: true });
  }

  const config: Record<string, unknown> = {
    models: { default: 'sonnet', test_writer: 'opus', summarizer: 'haiku', verifier: 'haiku' },
    execution: { max_retries: 2, expand_limit: 1, parallel_mode: 'parallel', snapshot_refresh: 'after_each_node', verify: 'gates' },
    context: { ancestors: 'L0', parents: 'L1' },
    spec: { schema: 'spec-driven', specs_dir: '.specwork/specs', changes_dir: '.specwork/changes', archive_dir: '.specwork/changes/archive', templates_dir: '.specwork/templates' },
    graph: { graphs_dir: '.specwork/graph', nodes_dir: '.specwork/nodes' },
    environments: { env_dir: '.specwork/env', active: 'development' },
  };

  if (opts.version) {
    config.specwork_version = opts.version;
  }

  fs.writeFileSync(path.join(root, '.specwork', 'config.yaml'), stringifyYaml(config), 'utf-8');
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

// ══════════════════════════════════════════════════════════════════════════════
// computeFileChecksum
// ══════════════════════════════════════════════════════════════════════════════

describe('computeFileChecksum', () => {
  let root: string;

  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('returns SHA256 hex digest of file contents', () => {
    const filePath = path.join(root, 'test.txt');
    const content = 'hello world';
    fs.writeFileSync(filePath, content, 'utf-8');

    const checksum = computeFileChecksum(filePath);
    const expected = sha256(content);
    expect(checksum).toBe(expected);
  });

  it('returns different checksums for different content', () => {
    const file1 = path.join(root, 'a.txt');
    const file2 = path.join(root, 'b.txt');
    fs.writeFileSync(file1, 'content-a', 'utf-8');
    fs.writeFileSync(file2, 'content-b', 'utf-8');

    const cs1 = computeFileChecksum(file1);
    const cs2 = computeFileChecksum(file2);
    expect(cs1).not.toBe(cs2);
  });

  it('returns identical checksums for identical content', () => {
    const file1 = path.join(root, 'a.txt');
    const file2 = path.join(root, 'b.txt');
    fs.writeFileSync(file1, 'same-content', 'utf-8');
    fs.writeFileSync(file2, 'same-content', 'utf-8');

    expect(computeFileChecksum(file1)).toBe(computeFileChecksum(file2));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// generateManifest
// ══════════════════════════════════════════════════════════════════════════════

describe('generateManifest', () => {
  let root: string;

  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('returns a mapping of relative paths to SHA256 checksums', () => {
    const fileA = path.join(root, 'a.txt');
    const fileB = path.join(root, 'b.txt');
    fs.writeFileSync(fileA, 'content-a', 'utf-8');
    fs.writeFileSync(fileB, 'content-b', 'utf-8');

    const files: Record<string, string> = { 'a.txt': 'content-a', 'b.txt': 'content-b' };
    const manifest = generateManifest(root, files);

    expect(manifest).toHaveProperty('a.txt');
    expect(manifest).toHaveProperty('b.txt');
    expect(manifest['a.txt']).toBe(sha256('content-a'));
    expect(manifest['b.txt']).toBe(sha256('content-b'));
  });

  it('generates checksums for all provided files', () => {
    const files: Record<string, string> = {
      'config.yaml': 'models:\n  default: sonnet\n',
      'templates/proposal.md': '# Proposal\n',
      'templates/design.md': '# Design\n',
    };
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(root, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, 'utf-8');
    }

    const manifest = generateManifest(root, files);
    expect(Object.keys(manifest)).toHaveLength(3);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// loadManifest / writeManifest
// ══════════════════════════════════════════════════════════════════════════════

describe('loadManifest', () => {
  let root: string;

  beforeEach(() => { root = makeTmpRoot(); initSpecwork(root); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('returns null when manifest.yaml does not exist', () => {
    const result = loadManifest(root);
    expect(result).toBeNull();
  });

  it('returns parsed manifest when file exists', () => {
    const manifestData = {
      specwork_version: '0.1.0',
      files: { 'config.yaml': 'abc123', 'templates/proposal.md': 'def456' },
    };
    fs.writeFileSync(
      path.join(root, '.specwork', 'manifest.yaml'),
      stringifyYaml(manifestData),
      'utf-8',
    );

    const result = loadManifest(root);
    expect(result).not.toBeNull();
    expect(result!.specwork_version).toBe('0.1.0');
    expect(result!.files).toHaveProperty('config.yaml');
  });
});

describe('writeManifest', () => {
  let root: string;

  beforeEach(() => { root = makeTmpRoot(); initSpecwork(root); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('writes manifest.yaml to .specwork directory', () => {
    const manifest = { specwork_version: '0.2.0', files: { 'a.txt': 'checksum1' } };
    writeManifest(root, manifest);

    const manifestPath = path.join(root, '.specwork', 'manifest.yaml');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const parsed = parseYaml(fs.readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
    expect(parsed.specwork_version).toBe('0.2.0');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// classifyFiles — Requirement: Manifest-Based Modification Detection
// ══════════════════════════════════════════════════════════════════════════════

describe('classifyFiles', () => {
  let root: string;

  beforeEach(() => { root = makeTmpRoot(); initSpecwork(root); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('classifies file as "unmodified" when checksum matches manifest', () => {
    const content = 'original content';
    const filePath = path.join(root, 'managed-file.md');
    fs.writeFileSync(filePath, content, 'utf-8');

    const manifest: Record<string, string> = { 'managed-file.md': sha256(content) };
    const result = classifyFiles(manifest, ['managed-file.md'], root);

    const entry = result.find((f: FileClassification) => f.path === 'managed-file.md');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe('unmodified');
  });

  it('classifies file as "modified" when checksum differs from manifest', () => {
    const filePath = path.join(root, 'managed-file.md');
    fs.writeFileSync(filePath, 'user-edited content', 'utf-8');

    const manifest: Record<string, string> = { 'managed-file.md': sha256('original content') };
    const result = classifyFiles(manifest, ['managed-file.md'], root);

    const entry = result.find((f: FileClassification) => f.path === 'managed-file.md');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe('modified');
  });

  it('classifies file as "new" when it does not exist on disk', () => {
    const manifest: Record<string, string> = {};
    const result = classifyFiles(manifest, ['brand-new-file.md'], root);

    const entry = result.find((f: FileClassification) => f.path === 'brand-new-file.md');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe('new');
  });

  it('treats ALL files as "modified" when manifest is null (legacy project)', () => {
    const filePath = path.join(root, 'existing-file.md');
    fs.writeFileSync(filePath, 'some content', 'utf-8');

    const result = classifyFiles(null, ['existing-file.md'], root);

    const entry = result.find((f: FileClassification) => f.path === 'existing-file.md');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe('modified');
  });

  it('classifies files not on disk as "new" even when manifest is null', () => {
    const result = classifyFiles(null, ['nonexistent.md'], root);

    const entry = result.find((f: FileClassification) => f.path === 'nonexistent.md');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe('new');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// backupFiles — Requirement: Backup Before Overwrite
// ══════════════════════════════════════════════════════════════════════════════

describe('backupFiles', () => {
  let root: string;

  beforeEach(() => { root = makeTmpRoot(); initSpecwork(root); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('copies files to .specwork/backups/<version>/ preserving relative paths', () => {
    const relPath = '.claude/agents/specwork-implementer.md';
    const absPath = path.join(root, relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, 'original agent content', 'utf-8');

    const backedUp = backupFiles(root, '0.1.0', [relPath]);

    const backupPath = path.join(root, '.specwork', 'backups', '0.1.0', relPath);
    expect(fs.existsSync(backupPath)).toBe(true);
    expect(fs.readFileSync(backupPath, 'utf-8')).toBe('original agent content');
    expect(backedUp).toContain(relPath);
  });

  it('creates backup directory structure if it does not exist', () => {
    const relPath = 'deep/nested/file.md';
    const absPath = path.join(root, relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, 'nested content', 'utf-8');

    backupFiles(root, '0.1.0', [relPath]);

    const backupPath = path.join(root, '.specwork', 'backups', '0.1.0', relPath);
    expect(fs.existsSync(backupPath)).toBe(true);
  });

  it('returns list of backed-up file paths', () => {
    const files = ['a.md', 'b.md'];
    for (const f of files) {
      fs.writeFileSync(path.join(root, f), `content-${f}`, 'utf-8');
    }

    const result = backupFiles(root, '0.2.0', files);
    expect(result).toHaveLength(2);
    expect(result).toContain('a.md');
    expect(result).toContain('b.md');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// deepMergeConfig — Requirement: Config Schema Migration
// ══════════════════════════════════════════════════════════════════════════════

describe('deepMergeConfig', () => {
  it('adds new fields from defaults that are missing in existing config', () => {
    const existing = {
      models: { default: 'sonnet' },
    };
    const defaults = {
      models: { default: 'sonnet' },
      environments: { env_dir: '.specwork/env', active: 'development' },
    };

    const { merged, fieldsAdded } = deepMergeConfig(existing, defaults);
    expect(merged).toHaveProperty('environments');
    expect((merged as Record<string, unknown>).environments).toEqual({ env_dir: '.specwork/env', active: 'development' });
    expect(fieldsAdded).toContain('environments');
  });

  it('preserves existing user values over defaults', () => {
    const existing = {
      models: { default: 'opus' },
    };
    const defaults = {
      models: { default: 'sonnet' },
    };

    const { merged } = deepMergeConfig(existing, defaults);
    expect((merged as { models: { default: string } }).models.default).toBe('opus');
  });

  it('deep-merges nested objects', () => {
    const existing = {
      models: { default: 'opus' },
    };
    const defaults = {
      models: { default: 'sonnet', test_writer: 'opus', summarizer: 'haiku' },
    };

    const { merged } = deepMergeConfig(existing, defaults);
    const models = (merged as { models: Record<string, string> }).models;
    expect(models.default).toBe('opus');       // preserved
    expect(models.test_writer).toBe('opus');   // added from defaults
    expect(models.summarizer).toBe('haiku');   // added from defaults
  });

  it('reports deprecated fields not present in defaults', () => {
    const existing = {
      models: { default: 'sonnet' },
      legacy_option: true,
    };
    const defaults = {
      models: { default: 'sonnet' },
    };

    const { deprecated } = deepMergeConfig(existing, defaults);
    expect(deprecated).toContain('legacy_option');
  });

  it('does NOT remove deprecated fields from merged output', () => {
    const existing = {
      models: { default: 'sonnet' },
      legacy_option: true,
    };
    const defaults = {
      models: { default: 'sonnet' },
    };

    const { merged } = deepMergeConfig(existing, defaults);
    expect(merged).toHaveProperty('legacy_option');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// checkLockedWorkflows — Requirement: Lock-File Workflow Protection
// ══════════════════════════════════════════════════════════════════════════════

describe('checkLockedWorkflows', () => {
  let root: string;

  beforeEach(() => { root = makeTmpRoot(); initSpecwork(root); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('returns empty array when no lock files exist', () => {
    const locked = checkLockedWorkflows(root);
    expect(locked).toEqual([]);
  });

  it('returns change names that have .lock files', () => {
    const lockDir = path.join(root, '.specwork', 'graph', 'add-auth');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(path.join(lockDir, '.lock'), '', 'utf-8');

    const locked = checkLockedWorkflows(root);
    expect(locked).toContain('add-auth');
  });

  it('returns multiple locked changes', () => {
    for (const change of ['feature-a', 'feature-b']) {
      const lockDir = path.join(root, '.specwork', 'graph', change);
      fs.mkdirSync(lockDir, { recursive: true });
      fs.writeFileSync(path.join(lockDir, '.lock'), '', 'utf-8');
    }

    const locked = checkLockedWorkflows(root);
    expect(locked).toHaveLength(2);
    expect(locked).toContain('feature-a');
    expect(locked).toContain('feature-b');
  });

  it('ignores graph directories without .lock files', () => {
    const graphDir = path.join(root, '.specwork', 'graph', 'completed-change');
    fs.mkdirSync(graphDir, { recursive: true });
    fs.writeFileSync(path.join(graphDir, 'graph.yaml'), 'change: completed-change\n', 'utf-8');

    const locked = checkLockedWorkflows(root);
    expect(locked).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// runUpdate — Requirements: Version Tracking, Dry-Run, Update Summary
// ══════════════════════════════════════════════════════════════════════════════

describe('runUpdate', () => {
  let root: string;

  beforeEach(() => { root = makeTmpRoot(); initSpecwork(root, { version: '0.1.0' }); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  // --- Requirement 1: Version Tracking ---

  it('updates specwork_version in config.yaml to current package version', () => {
    const result = runUpdate(root, {});
    expect(result.newVersion).toBeDefined();
    expect(result.previousVersion).toBe('0.1.0');

    // Verify config was actually updated
    const config = parseYaml(
      fs.readFileSync(path.join(root, '.specwork', 'config.yaml'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(config.specwork_version).toBe(result.newVersion);
  });

  it('reports already up-to-date when versions match', () => {
    // First update to get to current version
    const first = runUpdate(root, {});
    // Second update should detect no change needed
    const second = runUpdate(root, {});
    expect(second.previousVersion).toBe(second.newVersion);
    expect(second.filesUpdated).toBe(0);
  });

  // --- Requirement 5: Lock-File Workflow Protection ---

  it('throws or returns error when workflows are locked', () => {
    const lockDir = path.join(root, '.specwork', 'graph', 'add-auth');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(path.join(lockDir, '.lock'), '', 'utf-8');

    expect(() => runUpdate(root, {})).toThrow(/locked|blocked|add-auth/i);
  });

  // --- Requirement 6: Dry-Run Mode ---

  it('does not modify files when dryRun is true', () => {
    const configBefore = fs.readFileSync(
      path.join(root, '.specwork', 'config.yaml'),
      'utf-8',
    );

    const result = runUpdate(root, { dryRun: true });

    const configAfter = fs.readFileSync(
      path.join(root, '.specwork', 'config.yaml'),
      'utf-8',
    );
    expect(configAfter).toBe(configBefore);
    expect(result.dryRun).toBe(true);
  });

  it('returns UpdateResult with correct shape in dry-run', () => {
    const result = runUpdate(root, { dryRun: true });

    expect(result).toHaveProperty('previousVersion');
    expect(result).toHaveProperty('newVersion');
    expect(result).toHaveProperty('filesUpdated');
    expect(result).toHaveProperty('filesBackedUp');
    expect(result).toHaveProperty('configFieldsAdded');
    expect(result).toHaveProperty('deprecated');
    expect(result).toHaveProperty('backupPath');
    expect(result).toHaveProperty('dryRun');
  });

  // --- Requirement 3: Backup Before Overwrite ---

  it('backs up modified files and reports backup count', () => {
    // Create a managed file and write manifest for it
    const managedFile = '.claude/agents/specwork-implementer.md';
    const managedPath = path.join(root, managedFile);
    fs.mkdirSync(path.dirname(managedPath), { recursive: true });
    const originalContent = 'original managed content';
    fs.writeFileSync(managedPath, originalContent, 'utf-8');

    // Write a manifest with the original checksum
    const manifestData = {
      specwork_version: '0.1.0',
      files: { [managedFile]: sha256(originalContent) },
    };
    fs.writeFileSync(
      path.join(root, '.specwork', 'manifest.yaml'),
      stringifyYaml(manifestData),
      'utf-8',
    );

    // Simulate user modification
    fs.writeFileSync(managedPath, 'user-modified content', 'utf-8');

    const result = runUpdate(root, {});
    expect(result.filesBackedUp).toBeGreaterThan(0);
    expect(result.backupPath).not.toBeNull();
  });

  // --- Requirement 9: Update Summary Output ---

  it('returns UpdateResult with all summary fields populated', () => {
    const result = runUpdate(root, {});

    expect(typeof result.previousVersion).toBe('string');
    expect(typeof result.newVersion).toBe('string');
    expect(typeof result.filesUpdated).toBe('number');
    expect(typeof result.filesBackedUp).toBe('number');
    expect(Array.isArray(result.configFieldsAdded)).toBe(true);
    expect(Array.isArray(result.deprecated)).toBe(true);
    expect(typeof result.dryRun).toBe('boolean');
  });

  // --- Requirement 2: Manifest update after successful update ---

  it('writes updated manifest after successful update', () => {
    runUpdate(root, {});

    const manifestPath = path.join(root, '.specwork', 'manifest.yaml');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = parseYaml(fs.readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
    expect(manifest).toHaveProperty('files');
    expect(manifest).toHaveProperty('specwork_version');
  });

  it('does not write manifest in dry-run mode', () => {
    const manifestPath = path.join(root, '.specwork', 'manifest.yaml');
    // Ensure no manifest exists before
    if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);

    runUpdate(root, { dryRun: true });

    // Manifest should NOT be created in dry-run
    expect(fs.existsSync(manifestPath)).toBe(false);
  });
});
