import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseYaml, stringifyYaml } from '../io/yaml.js';
import { ensureDir } from '../io/filesystem.js';
import { SpecworkError } from '../utils/errors.js';
import { ExitCode } from '../types/index.js';
import type { FileClassification, UpdateResult } from '../types/common.js';
import type { SpecworkConfig } from '../types/config.js';
import { CLAUDE_FILES, CLAUDE_SETTINGS, SCHEMA_YAML, EXAMPLE_GRAPH, SPECWORK_GITIGNORE } from '../templates/claude-files.js';
import { DEFAULT_CONFIG, TEMPLATES } from '../cli/init.js';
import { getPendingMigrations, runMigrations } from '../migrations/index.js';

// ── Version helper ──────────────────────────────────────────────────────────

function getInstalledVersion(): string {
  const __fn = fileURLToPath(import.meta.url);
  const __dn = dirname(__fn);
  // Try bundled location first (dist/index.js → ../package.json)
  // then source location (src/core/updater.ts → ../../package.json)
  for (const rel of [join(__dn, '..', 'package.json'), join(__dn, '..', '..', 'package.json')]) {
    if (fs.existsSync(rel)) {
      return (JSON.parse(readFileSync(rel, 'utf8')) as { version: string }).version;
    }
  }
  return '0.0.0';
}

// ── Checksum helpers ────────────────────────────────────────────────────────

export function computeFileChecksum(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf-8');
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

// ── Manifest functions ──────────────────────────────────────────────────────

export interface ManifestData {
  specwork_version: string;
  generated_at: string;
  files: Record<string, string>;
  migrations_applied?: string[];
}

export function generateManifest(_root: string, files: Record<string, string>): Record<string, string> {
  const checksums: Record<string, string> = {};
  for (const [relPath, content] of Object.entries(files)) {
    checksums[relPath] = crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  }
  return checksums;
}

export function loadManifest(root: string): ManifestData | null {
  const manifestPath = path.join(root, '.specwork', 'manifest.yaml');
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  const content = fs.readFileSync(manifestPath, 'utf-8');
  return parseYaml<ManifestData>(content, manifestPath);
}

export function writeManifest(root: string, manifest: { specwork_version: string; files: Record<string, string>; migrations_applied?: string[] }): void {
  const manifestPath = path.join(root, '.specwork', 'manifest.yaml');
  ensureDir(path.dirname(manifestPath));
  const data: ManifestData = {
    specwork_version: manifest.specwork_version,
    generated_at: new Date().toISOString(),
    files: manifest.files,
    migrations_applied: manifest.migrations_applied,
  };
  fs.writeFileSync(manifestPath, stringifyYaml(data), 'utf-8');
}

// ── File classification ─────────────────────────────────────────────────────

export function classifyFiles(
  manifest: Record<string, string> | null,
  managedFiles: string[],
  root: string,
): FileClassification[] {
  return managedFiles.map((relPath) => {
    const absPath = path.join(root, relPath);
    const fileExists = fs.existsSync(absPath);

    if (!fileExists) {
      return { path: relPath, status: 'new' as const };
    }

    if (manifest === null) {
      return { path: relPath, status: 'modified' as const };
    }

    const manifestChecksum = manifest[relPath];
    if (!manifestChecksum) {
      return { path: relPath, status: 'modified' as const };
    }

    const currentChecksum = computeFileChecksum(absPath);
    if (currentChecksum === manifestChecksum) {
      return { path: relPath, status: 'unmodified' as const };
    }

    return { path: relPath, status: 'modified' as const };
  });
}

// ── Backup ──────────────────────────────────────────────────────────────────

export function backupFiles(root: string, version: string, files: string[]): string[] {
  const backedUp: string[] = [];
  for (const relPath of files) {
    const srcPath = path.join(root, relPath);
    if (!fs.existsSync(srcPath)) continue;

    const destPath = path.join(root, '.specwork', 'backups', version, relPath);
    ensureDir(path.dirname(destPath));
    fs.copyFileSync(srcPath, destPath);
    backedUp.push(relPath);
  }
  return backedUp;
}

// ── Config migration ────────────────────────────────────────────────────────

export function deepMergeConfig(
  existing: Record<string, unknown>,
  defaults: Record<string, unknown>,
): { merged: Record<string, unknown>; fieldsAdded: string[]; deprecated: string[] } {
  const merged = { ...existing };
  const fieldsAdded: string[] = [];
  const deprecated: string[] = [];

  for (const key of Object.keys(defaults)) {
    if (!(key in merged)) {
      merged[key] = defaults[key];
      fieldsAdded.push(key);
    } else if (
      typeof defaults[key] === 'object' &&
      defaults[key] !== null &&
      !Array.isArray(defaults[key]) &&
      typeof merged[key] === 'object' &&
      merged[key] !== null &&
      !Array.isArray(merged[key])
    ) {
      const sub = deepMergeConfig(
        merged[key] as Record<string, unknown>,
        defaults[key] as Record<string, unknown>,
      );
      merged[key] = sub.merged;
      fieldsAdded.push(...sub.fieldsAdded.map((f) => `${key}.${f}`));
      deprecated.push(...sub.deprecated.map((f) => `${key}.${f}`));
    }
  }

  for (const key of Object.keys(existing)) {
    if (!(key in defaults)) {
      deprecated.push(key);
    }
  }

  return { merged, fieldsAdded, deprecated };
}

// ── Lock check ──────────────────────────────────────────────────────────────

export function checkLockedWorkflows(root: string): string[] {
  const graphDir = path.join(root, '.specwork', 'graph');
  if (!fs.existsSync(graphDir)) return [];

  const locked: string[] = [];
  const entries = fs.readdirSync(graphDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const lockFile = path.join(graphDir, entry.name, '.lock');
    if (fs.existsSync(lockFile)) {
      locked.push(entry.name);
    }
  }
  return locked;
}

// ── Build managed files map ─────────────────────────────────────────────────

function buildManagedFiles(): Record<string, string> {
  const files: Record<string, string> = {};

  for (const [filename, content] of Object.entries(TEMPLATES)) {
    files[`.specwork/templates/${filename}`] = content;
  }
  for (const [relPath, content] of Object.entries(CLAUDE_FILES)) {
    files[relPath] = content;
  }
  files['.claude/settings.json'] = JSON.stringify(CLAUDE_SETTINGS, null, 2) + '\n';
  files['.specwork/schema.yaml'] = SCHEMA_YAML;
  files['.specwork/examples/example-graph.yaml'] = EXAMPLE_GRAPH;
  files['.specwork/.gitignore'] = SPECWORK_GITIGNORE;

  return files;
}

// ── Run update ──────────────────────────────────────────────────────────────

export function runUpdate(
  root: string,
  opts: { dryRun?: boolean; force?: boolean },
): UpdateResult {
  const installedVersion = getInstalledVersion();

  // Check for locked workflows FIRST (before any version logic)
  const locked = checkLockedWorkflows(root);
  if (locked.length > 0) {
    throw new SpecworkError(
      `Cannot update: workflows locked for: ${locked.join(', ')}. Complete or abort them first.`,
      ExitCode.BLOCKED,
    );
  }

  const configPath = path.join(root, '.specwork', 'config.yaml');
  const configContent = fs.readFileSync(configPath, 'utf-8');
  const config = parseYaml<SpecworkConfig>(configContent, configPath);
  const previousVersion = config.specwork_version ?? null;

  const managedFiles = buildManagedFiles();
  const manifestData = loadManifest(root);
  const manifestFiles = manifestData?.files ?? null;
  const classifications = classifyFiles(manifestFiles, Object.keys(managedFiles), root);

  // Determine pending migrations
  const appliedMigrations = manifestData?.migrations_applied ?? [];
  const pendingMigrations = previousVersion
    ? getPendingMigrations(previousVersion, installedVersion, appliedMigrations)
    : [];

  // Already up to date: versions match, manifest exists, no files have drifted, no pending migrations
  const hasDrift = classifications.some((f) => f.status !== 'unmodified');
  if (previousVersion === installedVersion && manifestFiles && !hasDrift && pendingMigrations.length === 0 && !opts.force) {
    return {
      previousVersion,
      newVersion: installedVersion,
      filesUpdated: 0,
      filesBackedUp: 0,
      configFieldsAdded: [],
      deprecated: [],
      backupPath: null,
      dryRun: opts.dryRun ?? false,
      migrationsRun: [],
    };
  }

  // Config migration
  const configMerge = deepMergeConfig(
    config as unknown as Record<string, unknown>,
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
  );

  if (opts.dryRun) {
    const versionDiffers = previousVersion !== installedVersion;
    return {
      previousVersion,
      newVersion: installedVersion,
      filesUpdated: versionDiffers ? Object.keys(managedFiles).length : classifications.filter((f) => f.status !== 'unmodified').length,
      filesBackedUp: classifications.filter((f) => f.status === 'modified').length,
      configFieldsAdded: configMerge.fieldsAdded,
      deprecated: configMerge.deprecated,
      backupPath: previousVersion ? path.join('.specwork', 'backups', previousVersion) : null,
      dryRun: true,
      migrationsRun: pendingMigrations.map((m) => m.version),
    };
  }

  // Backup modified files
  const modifiedFiles = classifications
    .filter((f) => f.status === 'modified')
    .map((f) => f.path);
  const backedUpFiles = backupFiles(root, previousVersion ?? 'unknown', modifiedFiles);
  const backupPath = backedUpFiles.length > 0
    ? path.join('.specwork', 'backups', previousVersion ?? 'unknown')
    : null;

  // Run migrations (after backup, before file overwrite)
  const migrationResult = runMigrations(
    root,
    configMerge.merged as Record<string, unknown>,
    pendingMigrations,
  );
  if (migrationResult.error) {
    throw new SpecworkError(
      `Migration ${migrationResult.error.version} failed: ${migrationResult.error.message}`,
      ExitCode.ERROR,
    );
  }

  // Write all managed files
  let filesUpdated = 0;
  for (const [relPath, content] of Object.entries(managedFiles)) {
    const absPath = path.join(root, relPath);
    ensureDir(path.dirname(absPath));
    fs.writeFileSync(absPath, content, 'utf-8');
    if (relPath.endsWith('.sh')) {
      fs.chmodSync(absPath, 0o755);
    }
    filesUpdated++;
  }

  // Write merged config with updated version
  const mergedConfig = configMerge.merged as Record<string, unknown>;
  mergedConfig.specwork_version = installedVersion;
  fs.writeFileSync(configPath, stringifyYaml(mergedConfig), 'utf-8');

  // Generate and write new manifest (with migrations_applied)
  const newManifestFiles = generateManifest(root, managedFiles);
  newManifestFiles['.specwork/config.yaml'] = computeFileChecksum(configPath);
  const allApplied = [...appliedMigrations, ...migrationResult.executed];
  writeManifest(root, {
    specwork_version: installedVersion,
    files: newManifestFiles,
    migrations_applied: allApplied.length > 0 ? allApplied : undefined,
  });

  return {
    previousVersion,
    newVersion: installedVersion,
    filesUpdated,
    filesBackedUp: backedUpFiles.length,
    configFieldsAdded: configMerge.fieldsAdded,
    deprecated: configMerge.deprecated,
    backupPath,
    dryRun: false,
    migrationsRun: migrationResult.executed,
  };
}
