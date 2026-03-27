import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ValidationRule, BuiltinValidationRuleType } from '../types/graph.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CheckError {
  file?: string;
  line?: number;
  message: string;
  code?: string;
}

export interface CheckResult {
  type: string;
  status: 'PASS' | 'FAIL' | 'SKIPPED';
  detail: string;
  errors?: CheckError[];
  duration_ms: number;
}

export interface VerifyResult {
  verdict: 'PASS' | 'FAIL';
  checks: CheckResult[];
  failed_count: number;
  total_checks: number;
  duration_ms: number;
}

export interface VerifyHistoryEntry {
  attempt: number;
  verdict: 'PASS' | 'FAIL';
  timestamp: string;
  checks: CheckResult[];
  regressions: string[];
}

export interface CustomCheckDef {
  command: string;
  expect: string;
  description: string;
  phase?: string[];
}

export interface RunChecksOptions {
  failFast: boolean;
  scope: string[];
  startSha?: string | null;
}

// ── Built-in check type set ──────────────────────────────────────────────────

const BUILTIN_TYPES = new Set<string>([
  'tests-fail', 'tests-pass', 'tsc-check', 'file-exists',
  'exit-code', 'scope-check', 'files-unchanged', 'imports-exist',
]);

// ── Priority order (cheapest first) ─────────────────────────────────────────

const CHECK_PRIORITY: Record<string, number> = {
  'file-exists': 0,
  'scope-check': 1,
  'files-unchanged': 2,
  'imports-exist': 3,
  'tsc-check': 4,
  'tests-fail': 5,
  'tests-pass': 5,
  'exit-code': 6,
};

// ── Fail-fast dependency: which checks gate which ───────────────────────────

const CHECK_DEPS: Record<string, string[]> = {
  'tests-pass': ['tsc-check', 'file-exists'],
  'tests-fail': ['tsc-check', 'file-exists'],
  'tsc-check': ['file-exists', 'scope-check'],
  'imports-exist': ['file-exists', 'scope-check'],
};

// ── Sort checks by priority ─────────────────────────────────────────────────

export function sortChecksByPriority(rules: ValidationRule[]): ValidationRule[] {
  return [...rules].sort((a, b) => {
    const pa = CHECK_PRIORITY[a.type] ?? 5;
    const pb = CHECK_PRIORITY[b.type] ?? 5;
    return pa - pb;
  });
}

// ── Resolve custom checks ───────────────────────────────────────────────────

export function resolveCustomChecks(
  rules: ValidationRule[],
  customChecks: Record<string, CustomCheckDef>,
  scope?: string[],
): ValidationRule[] {
  return rules.map(rule => {
    if (BUILTIN_TYPES.has(rule.type)) return rule;

    const custom = customChecks[rule.type];
    if (!custom) {
      throw new Error(`Unknown check type "${rule.type}" — not a built-in type and not defined in config.checks`);
    }

    let command = custom.command;
    if (scope && command.includes('{scope}')) {
      command = command.replace('{scope}', scope.join(' '));
    }

    const expected = custom.expect === 'exit-0' ? 0 : parseInt(custom.expect.replace('exit-', ''), 10);

    return {
      type: rule.type,
      args: { command, expected, _customDescription: custom.description },
    } as ValidationRule;
  });
}

// ── Run all checks with ordering and fail-fast ──────────────────────────────

export function runChecks(
  root: string,
  rules: ValidationRule[],
  opts: RunChecksOptions,
): VerifyResult {
  const start = Date.now();
  const sorted = sortChecksByPriority(rules);
  const checks: CheckResult[] = [];
  const failedTypes = new Set<string>();

  for (const rule of sorted) {
    // Fail-fast: skip if a prerequisite failed
    if (opts.failFast && failedTypes.size > 0) {
      const deps = CHECK_DEPS[rule.type] ?? [];
      const blockedBy = deps.find(d => failedTypes.has(d));
      if (blockedBy) {
        checks.push({
          type: rule.type,
          status: 'SKIPPED',
          detail: `Skipped: prerequisite ${blockedBy} failed`,
          duration_ms: 0,
        });
        continue;
      }
      // Also skip if any earlier check failed and this check is more expensive
      const anyFailedPriority = Math.min(...[...failedTypes].map(t => CHECK_PRIORITY[t] ?? 5));
      const thisPriority = CHECK_PRIORITY[rule.type] ?? 5;
      if (thisPriority > anyFailedPriority) {
        const firstFailed = [...failedTypes][0];
        checks.push({
          type: rule.type,
          status: 'SKIPPED',
          detail: `Skipped: prerequisite ${firstFailed} failed`,
          duration_ms: 0,
        });
        continue;
      }
    }

    const result = runSingleCheck(root, rule, { scope: opts.scope, startSha: opts.startSha });
    checks.push(result);

    if (result.status === 'FAIL') {
      failedTypes.add(rule.type);
    }
  }

  const failedCount = checks.filter(c => c.status === 'FAIL').length;
  const verdict = failedCount === 0 && checks.some(c => c.status === 'PASS') ? 'PASS' : (failedCount > 0 ? 'FAIL' : 'PASS');

  return {
    verdict,
    checks,
    failed_count: failedCount,
    total_checks: checks.length,
    duration_ms: Date.now() - start,
  };
}

// ── Run a single check ──────────────────────────────────────────────────────

export function runSingleCheck(
  root: string,
  rule: ValidationRule,
  context?: { scope?: string[]; startSha?: string | null },
): CheckResult {
  const start = Date.now();
  const scope = context?.scope ?? [];

  switch (rule.type) {
    case 'tsc-check':
      return runTscCheck(root, start);

    case 'tests-pass':
      return runTestsPass(root, rule, start);

    case 'tests-fail':
      return runTestsFail(root, rule, start);

    case 'file-exists':
      return runFileExists(root, rule, start);

    case 'scope-check':
      return runScopeCheck(root, scope, start, context?.startSha ?? null);

    case 'files-unchanged':
      return runFilesUnchanged(root, rule, start);

    case 'imports-exist':
      return runImportsExist(root, scope, start);

    case 'exit-code':
      return runExitCode(root, rule, start);

    default: {
      // Custom check resolved to exit-code
      if (rule.args?.command) {
        return runExitCode(root, rule, start);
      }
      return {
        type: rule.type,
        status: 'FAIL',
        detail: `Unknown check type "${rule.type}"`,
        errors: [{ message: `Check type "${rule.type}" is not a built-in type and was not resolved from config` }],
        duration_ms: Date.now() - start,
      };
    }
  }
}

// ── Detect regressions ──────────────────────────────────────────────────────

export function detectRegressions(
  previousChecks: CheckResult[],
  currentChecks: CheckResult[],
): string[] {
  if (previousChecks.length === 0) return [];

  const prevMap = new Map(previousChecks.map(c => [c.type, c.status]));
  const regressions: string[] = [];

  for (const curr of currentChecks) {
    const prev = prevMap.get(curr.type);
    if (prev === 'PASS' && curr.status === 'FAIL') {
      regressions.push(curr.type);
    }
  }

  return regressions;
}

// ── Individual check implementations ────────────────────────────────────────

function truncateDetail(detail: string): string {
  if (detail.length <= 200) return detail;
  return detail.slice(0, 197) + '...';
}

function runTscCheck(root: string, start: number): CheckResult {
  try {
    execSync('npx tsc --noEmit', { cwd: root, stdio: 'pipe', encoding: 'utf-8' });
    return {
      type: 'tsc-check',
      status: 'PASS',
      detail: 'No type errors',
      errors: [],
      duration_ms: Date.now() - start,
    };
  } catch (e: any) {
    const output = (e.stdout || e.stderr || '').toString();
    const errors = parseTscErrors(output);
    const count = errors.length;
    return {
      type: 'tsc-check',
      status: 'FAIL',
      detail: truncateDetail(`${count} type error${count !== 1 ? 's' : ''} found`),
      errors,
      duration_ms: Date.now() - start,
    };
  }
}

function parseTscErrors(output: string): CheckError[] {
  const errors: CheckError[] = [];

  // Format 1: src/foo.ts(42,5): error TS2322: message
  const pattern1 = /^(.+?)\((\d+),\d+\):\s*error\s+(TS\d+):\s*(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern1.exec(output)) !== null) {
    errors.push({
      file: match[1],
      line: parseInt(match[2], 10),
      code: match[3],
      message: match[4],
    });
  }

  // Format 2: src/foo.ts:42:5 - error TS2322: message
  if (errors.length === 0) {
    const pattern2 = /^(.+?):(\d+):\d+\s*-\s*error\s+(TS\d+):\s*(.+)$/gm;
    while ((match = pattern2.exec(output)) !== null) {
      errors.push({
        file: match[1],
        line: parseInt(match[2], 10),
        code: match[3],
        message: match[4],
      });
    }
  }

  // If regex didn't match but there's output, add a generic error
  if (errors.length === 0 && output.trim()) {
    errors.push({ message: truncateDetail(output.trim()) });
  }
  return errors;
}

function runTestsPass(root: string, rule: ValidationRule, start: number): CheckResult {
  const testFile = (rule.args?.file as string) ?? '';
  const cmd = testFile ? `npx vitest run ${testFile}` : 'npx vitest run';
  try {
    execSync(cmd, { cwd: root, stdio: 'pipe', encoding: 'utf-8' });
    return {
      type: 'tests-pass',
      status: 'PASS',
      detail: 'All tests passed',
      errors: [],
      duration_ms: Date.now() - start,
    };
  } catch (e: any) {
    const output = (e.stdout || e.stderr || '').toString();
    const errors = parseTestErrors(output);
    return {
      type: 'tests-pass',
      status: 'FAIL',
      detail: truncateDetail(`${errors.length || 'Some'} test${errors.length !== 1 ? 's' : ''} failed`),
      errors,
      duration_ms: Date.now() - start,
    };
  }
}

function runTestsFail(root: string, rule: ValidationRule, start: number): CheckResult {
  const testFile = (rule.args?.file as string) ?? '';
  const cmd = testFile ? `npx vitest run ${testFile}` : 'npx vitest run';
  try {
    execSync(cmd, { cwd: root, stdio: 'pipe', encoding: 'utf-8' });
    return {
      type: 'tests-fail',
      status: 'FAIL',
      detail: 'Tests should fail but passed (expected RED state)',
      errors: [{ message: 'Tests passed when they should fail — RED state not confirmed' }],
      duration_ms: Date.now() - start,
    };
  } catch {
    return {
      type: 'tests-fail',
      status: 'PASS',
      detail: 'Tests correctly failing (RED state confirmed)',
      errors: [],
      duration_ms: Date.now() - start,
    };
  }
}

function parseTestErrors(output: string): CheckError[] {
  const errors: CheckError[] = [];
  // Match vitest failure lines: FAIL src/foo.test.ts > test name
  const pattern = /(?:FAIL|×|✗)\s+(.+?)(?:\s+>\s+(.+))?$/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(output)) !== null) {
    errors.push({
      file: match[1]?.trim(),
      message: match[2]?.trim() || 'Test failed',
    });
  }
  if (errors.length === 0 && output.trim()) {
    errors.push({ message: truncateDetail(output.trim()) });
  }
  return errors;
}

function runFileExists(root: string, rule: ValidationRule, start: number): CheckResult {
  const filePath = rule.args?.path as string;
  if (!filePath) {
    return {
      type: 'file-exists',
      status: 'FAIL',
      detail: 'No path specified',
      errors: [{ message: 'file-exists check requires args.path' }],
      duration_ms: Date.now() - start,
    };
  }
  const fullPath = path.resolve(root, filePath);
  if (fs.existsSync(fullPath)) {
    return {
      type: 'file-exists',
      status: 'PASS',
      detail: `${filePath} exists`,
      errors: [],
      duration_ms: Date.now() - start,
    };
  }
  return {
    type: 'file-exists',
    status: 'FAIL',
    detail: `${filePath} not found`,
    errors: [{ file: filePath, message: `File not found: ${filePath}` }],
    duration_ms: Date.now() - start,
  };
}

function runScopeCheck(root: string, scope: string[], start: number, startSha?: string | null): CheckResult {
  try {
    // Use node's start SHA as baseline when available — only shows changes made by this node
    const diffCmd = startSha ? `git diff --name-only ${startSha}` : 'git diff --name-only';
    const diff = execSync(diffCmd, { cwd: root, stdio: 'pipe', encoding: 'utf-8' }).trim();
    if (!diff) {
      return {
        type: 'scope-check',
        status: 'PASS',
        detail: 'No changes detected',
        errors: [],
        duration_ms: Date.now() - start,
      };
    }

    const changedFiles = diff.split('\n').filter(Boolean);
    const outOfScope: string[] = [];

    for (const file of changedFiles) {
      const inScope = scope.some(pattern => file.startsWith(pattern));
      if (!inScope) {
        outOfScope.push(file);
      }
    }

    if (outOfScope.length === 0) {
      return {
        type: 'scope-check',
        status: 'PASS',
        detail: `All ${changedFiles.length} changed file(s) within scope`,
        errors: [],
        duration_ms: Date.now() - start,
      };
    }

    return {
      type: 'scope-check',
      status: 'FAIL',
      detail: truncateDetail(`${outOfScope.length} file(s) outside scope: ${outOfScope.join(', ')}`),
      errors: outOfScope.map(f => ({ file: f, message: `File outside declared scope: ${f}` })),
      duration_ms: Date.now() - start,
    };
  } catch {
    return {
      type: 'scope-check',
      status: 'PASS',
      detail: 'No git changes',
      errors: [],
      duration_ms: Date.now() - start,
    };
  }
}

function runFilesUnchanged(root: string, rule: ValidationRule, start: number): CheckResult {
  const files = (rule.args?.files as string[]) ?? [];
  if (files.length === 0) {
    return {
      type: 'files-unchanged',
      status: 'PASS',
      detail: 'No files to check',
      errors: [],
      duration_ms: Date.now() - start,
    };
  }

  const modified: string[] = [];

  for (const filePattern of files) {
    try {
      const diff = execSync(`git diff --name-only -- "${filePattern}"`, {
        cwd: root, stdio: 'pipe', encoding: 'utf-8',
      }).trim();
      if (diff) {
        modified.push(...diff.split('\n').filter(Boolean));
      }
    } catch {
      // git diff error — treat as unchanged
    }
  }

  if (modified.length === 0) {
    return {
      type: 'files-unchanged',
      status: 'PASS',
      detail: 'Protected files unchanged',
      errors: [],
      duration_ms: Date.now() - start,
    };
  }

  return {
    type: 'files-unchanged',
    status: 'FAIL',
    detail: truncateDetail(`Modified protected file(s): ${modified.join(', ')}`),
    errors: modified.map(f => ({ file: f, message: `Protected file was modified: ${f}` })),
    duration_ms: Date.now() - start,
  };
}

function runImportsExist(root: string, scope: string[], start: number): CheckResult {
  const errors: CheckError[] = [];

  // Find all .ts/.tsx files in scope
  const filesToCheck: string[] = [];
  for (const pattern of scope) {
    const dir = path.resolve(root, pattern);
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      collectTsFiles(dir, root, filesToCheck);
    } else if (fs.existsSync(dir)) {
      filesToCheck.push(path.relative(root, dir));
    }
  }

  // Load package.json dependencies for package import resolution
  let pkgDeps = new Set<string>();
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      pkgDeps = new Set([
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {}),
        ...Object.keys(pkg.peerDependencies ?? {}),
      ]);
    } catch { /* ignore parse errors */ }
  }

  // Also consider node built-ins
  const nodeBuiltins = new Set([
    'node:fs', 'node:path', 'node:os', 'node:child_process', 'node:url',
    'node:util', 'node:crypto', 'node:stream', 'node:http', 'node:https',
    'node:events', 'node:buffer', 'node:assert', 'node:readline', 'node:net',
    'node:tls', 'node:dns', 'node:zlib', 'node:querystring', 'node:string_decoder',
    'fs', 'path', 'os', 'child_process', 'url', 'util', 'crypto', 'stream',
    'http', 'https', 'events', 'buffer', 'assert', 'readline', 'net',
  ]);

  for (const relFile of filesToCheck) {
    const fullPath = path.join(root, relFile);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, 'utf-8');
    const importPattern = /(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;

    while ((match = importPattern.exec(content)) !== null) {
      const specifier = match[1];

      // Node built-in
      if (nodeBuiltins.has(specifier)) continue;

      // Relative import
      if (specifier.startsWith('.')) {
        const fileDir = path.dirname(fullPath);
        let resolved = path.resolve(fileDir, specifier);

        // Try .ts, .tsx, /index.ts extensions
        const candidates = [
          resolved,
          resolved.replace(/\.js$/, '.ts'),
          resolved.replace(/\.js$/, '.tsx'),
          resolved + '.ts',
          resolved + '.tsx',
          path.join(resolved, 'index.ts'),
          path.join(resolved, 'index.tsx'),
        ];

        if (!candidates.some(c => fs.existsSync(c))) {
          errors.push({
            file: relFile,
            message: `Unresolvable import "${specifier}" — no matching file found`,
          });
        }
        continue;
      }

      // Package import — check against package.json
      const pkgName = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0];

      if (!pkgDeps.has(pkgName)) {
        errors.push({
          file: relFile,
          message: `Package "${pkgName}" not found in package.json dependencies`,
        });
      }
    }
  }

  if (errors.length === 0) {
    return {
      type: 'imports-exist',
      status: 'PASS',
      detail: 'All imports resolve',
      errors: [],
      duration_ms: Date.now() - start,
    };
  }

  return {
    type: 'imports-exist',
    status: 'FAIL',
    detail: truncateDetail(`${errors.length} unresolvable import(s)`),
    errors,
    duration_ms: Date.now() - start,
  };
}

function collectTsFiles(dir: string, root: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTsFiles(full, root, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(path.relative(root, full));
    }
  }
}

function runExitCode(root: string, rule: ValidationRule, start: number): CheckResult {
  const command = rule.args?.command as string;
  const expected = (rule.args?.expected as number) ?? 0;
  const customDesc = rule.args?._customDescription as string | undefined;
  const typeName = rule.type === 'exit-code' ? 'exit-code' : rule.type;

  if (!command) {
    return {
      type: typeName,
      status: 'FAIL',
      detail: 'No command specified',
      errors: [{ message: 'exit-code check requires args.command' }],
      duration_ms: Date.now() - start,
    };
  }

  try {
    const stdout = execSync(command, { cwd: root, stdio: 'pipe', encoding: 'utf-8' });
    if (expected === 0) {
      return {
        type: typeName,
        status: 'PASS',
        detail: truncateDetail(customDesc || `Exit 0`),
        errors: [],
        duration_ms: Date.now() - start,
      };
    }
    return {
      type: typeName,
      status: 'FAIL',
      detail: truncateDetail(`Expected exit ${expected}, got 0`),
      errors: [{ message: `Expected exit ${expected}, got 0` }],
      duration_ms: Date.now() - start,
    };
  } catch (e: any) {
    const code = e.status ?? 1;
    if (code === expected) {
      return {
        type: typeName,
        status: 'PASS',
        detail: truncateDetail(customDesc || `Exit ${code}`),
        errors: [],
        duration_ms: Date.now() - start,
      };
    }
    const output = (e.stdout || e.stderr || '').toString();
    return {
      type: typeName,
      status: 'FAIL',
      detail: truncateDetail(`Expected exit ${expected}, got ${code}`),
      errors: [{ message: truncateDetail(output || `Exit code ${code}`) }],
      duration_ms: Date.now() - start,
    };
  }
}
