#!/usr/bin/env node

/**
 * Postversion script — auto-generates a migration stub when `npm version` runs.
 * Usage: node scripts/generate-migration.js
 *
 * Reads the new version from package.json and creates:
 * 1. src/migrations/<version>.ts — migration stub with skeleton migrate function
 * 2. Appends import + registry entry to src/migrations/index.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

// Read version from package.json
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;

const migrationPath = join(root, 'src', 'migrations', `${version}.ts`);
const registryPath = join(root, 'src', 'migrations', 'index.ts');

// Don't overwrite existing migration
if (existsSync(migrationPath)) {
  process.stderr.write(`Warning: Migration file already exists at ${migrationPath} — skipping.\n`);
  process.exit(0);
}

// Generate stub
const versionVar = version.replace(/\./g, '_');
const stub = `import type { MigrationFn } from '../types/migration.js';

export const description = 'Migration for version ${version}';

export const migrate: MigrationFn = (_root, _config) => {
  // TODO: Add migration logic for version ${version}
  //
  // Examples:
  //   - Rename config field:  if (config.oldName) { config.newName = config.oldName; delete config.oldName; return { changed: true }; }
  //   - Add new default:      if (!config.newField) { config.newField = 'default'; return { changed: true }; }
  //   - Remove deprecated:    if (config.deprecated) { delete config.deprecated; return { changed: true }; }
  //
  // Migrations MUST be idempotent — safe to run multiple times.

  return { changed: false };
};
`;

writeFileSync(migrationPath, stub, 'utf8');
process.stderr.write(`Created migration stub: src/migrations/${version}.ts\n`);

// Append to registry
if (existsSync(registryPath)) {
  let registryContent = readFileSync(registryPath, 'utf8');

  const importLine = `import { migrate as migrate_${versionVar}, description as desc_${versionVar} } from './${version}.js';`;
  const entryLine = `  { version: '${version}', description: desc_${versionVar}, migrate: migrate_${versionVar} },`;

  // Add import after the last existing migration import
  const lastImportIdx = registryContent.lastIndexOf("import { migrate as migrate_");
  if (lastImportIdx !== -1) {
    const lineEnd = registryContent.indexOf('\n', lastImportIdx);
    registryContent = registryContent.slice(0, lineEnd + 1) + importLine + '\n' + registryContent.slice(lineEnd + 1);
  }

  // Add entry to the migrations array (before the closing ])
  const closingBracket = registryContent.lastIndexOf('];');
  if (closingBracket !== -1) {
    registryContent = registryContent.slice(0, closingBracket) + entryLine + '\n' + registryContent.slice(closingBracket);
  }

  writeFileSync(registryPath, registryContent, 'utf8');
  process.stderr.write(`Updated migration registry: src/migrations/index.ts\n`);
}
