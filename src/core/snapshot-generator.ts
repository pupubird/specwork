import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { writeMarkdown, ensureDir } from '../io/filesystem.js';
import { snapshotPath } from '../utils/paths.js';
import { debug } from '../utils/logger.js';

/**
 * Patterns to exclude from the file tree (common non-source dirs).
 */
const EXCLUDE_DIRS = [
  'node_modules',
  '.git',
  '.specwork',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '__pycache__',
  '.cache',
];

function buildFileTree(root: string): string {
  try {
    // Use find to get all files, excluding ignored dirs
    const excludeArgs = EXCLUDE_DIRS.map(d => `-name "${d}" -prune`).join(' -o ');
    const cmd = `find . \\( ${excludeArgs} \\) -o -type f -print | sort`;
    const output = execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = output
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && l !== '.');
    return lines.join('\n');
  } catch {
    debug('file tree generation failed, using fallback');
    return '(could not generate file tree)';
  }
}

function readDependencies(root: string): string {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return '';

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };

    const sections: string[] = [];

    if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
      const deps = Object.entries(pkg.dependencies)
        .map(([name, ver]) => `- ${name}: ${ver}`)
        .join('\n');
      sections.push('### dependencies\n' + deps);
    }

    if (pkg.devDependencies && Object.keys(pkg.devDependencies).length > 0) {
      const devDeps = Object.entries(pkg.devDependencies)
        .map(([name, ver]) => `- ${name}: ${ver}`)
        .join('\n');
      sections.push('### devDependencies\n' + devDeps);
    }

    if (pkg.peerDependencies && Object.keys(pkg.peerDependencies).length > 0) {
      const peerDeps = Object.entries(pkg.peerDependencies)
        .map(([name, ver]) => `- ${name}: ${ver}`)
        .join('\n');
      sections.push('### peerDependencies\n' + peerDeps);
    }

    return sections.join('\n\n');
  } catch {
    debug('Failed to parse package.json');
    return '(could not parse package.json)';
  }
}

function extractExportedSymbols(root: string): string {
  try {
    // Grep for export declarations in TS/TSX/JS/JSX files
    const cmd = `grep -r --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" -h "^export" . 2>/dev/null | sort -u`;
    const output = execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = output
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length === 0) return '(no exported symbols found)';

    // Limit to 200 lines to avoid bloat
    const limited = lines.slice(0, 200);
    const suffix = lines.length > 200 ? `\n... (${lines.length - 200} more)` : '';
    return limited.join('\n') + suffix;
  } catch {
    debug('Export symbol extraction failed');
    return '(could not extract exported symbols)';
  }
}

function listConfigFiles(root: string): string {
  const CONFIG_PATTERNS = [
    'tsconfig*.json',
    'jsconfig.json',
    '.eslintrc*',
    'eslint.config.*',
    'prettier.config.*',
    '.prettierrc*',
    'vitest.config.*',
    'jest.config.*',
    'vite.config.*',
    'webpack.config.*',
    'rollup.config.*',
    'babel.config.*',
    '.babelrc*',
    'Makefile',
    'Dockerfile',
    'docker-compose*',
    '.env.example',
    'pyproject.toml',
    'setup.py',
    'requirements*.txt',
    'Cargo.toml',
    'go.mod',
  ];

  const found: string[] = [];
  for (const pattern of CONFIG_PATTERNS) {
    try {
      const cmd = `find . -maxdepth 2 -name "${pattern}" -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null`;
      const output = execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      const files = output.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      found.push(...files);
    } catch {
      // ignore per-pattern failures
    }
  }

  return found.sort().join('\n') || '(no config files found)';
}

export function generateSnapshot(root: string): string {
  const timestamp = new Date().toISOString();
  const sections: string[] = [];

  sections.push(`# Environment Snapshot\n\n_Generated: ${timestamp}_`);

  const fileTree = buildFileTree(root);
  sections.push('## File Tree\n\n```\n' + fileTree + '\n```');

  const deps = readDependencies(root);
  if (deps) {
    sections.push('## Dependencies (package.json)\n\n' + deps);
  }

  const exports = extractExportedSymbols(root);
  sections.push('## Exported Symbols\n\n```typescript\n' + exports + '\n```');

  const configs = listConfigFiles(root);
  sections.push('## Config Files\n\n' + configs);

  return sections.join('\n\n---\n\n');
}

export function writeSnapshot(root: string): void {
  const snapPath = snapshotPath(root);
  ensureDir(path.dirname(snapPath));
  const content = generateSnapshot(root);
  writeMarkdown(snapPath, content);
}
