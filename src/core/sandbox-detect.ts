import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { DetectConfig, DetectionResult, SandboxService } from '../types/sandbox.js';

function fileExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function detectProject(
  rootDir: string,
  config?: DetectConfig,
): Promise<DetectionResult> {
  const cfg: DetectConfig = config ?? {
    test_runner: 'auto',
    e2e_framework: 'auto',
    prompt_if_missing: false,
  };

  // ── Read package.json ────────────────────────────────────────────────────
  const pkgPath = path.join(rootDir, 'package.json');
  let projectType: DetectionResult['project_type'] = 'unknown';
  let packageManager: DetectionResult['package_manager'] = null;
  let devDeps: Record<string, string> = {};
  let deps: Record<string, string> = {};
  let scripts: Record<string, string> = {};

  if (fileExists(pkgPath)) {
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    // Will throw if malformed
    const pkg = JSON.parse(raw);
    projectType = 'node';
    devDeps = pkg.devDependencies ?? {};
    deps = pkg.dependencies ?? {};
    scripts = pkg.scripts ?? {};

    // Detect package manager
    if (fileExists(path.join(rootDir, 'yarn.lock'))) {
      packageManager = 'yarn';
    } else if (fileExists(path.join(rootDir, 'pnpm-lock.yaml'))) {
      packageManager = 'pnpm';
    } else {
      packageManager = 'npm';
    }
  }

  // ── Test runner detection ───────────────────────────────────────────────
  let testRunner: string | null = null;
  if (cfg.test_runner !== 'auto') {
    testRunner = cfg.test_runner;
  } else if (projectType === 'node') {
    if ('vitest' in devDeps) {
      testRunner = 'vitest';
    } else if ('jest' in devDeps) {
      testRunner = 'jest';
    } else if ('mocha' in devDeps) {
      testRunner = 'mocha';
    }
  }

  // ── E2E framework detection ─────────────────────────────────────────────
  let e2eFramework: string | null = null;
  let e2eMissing: boolean | undefined;

  if (cfg.e2e_framework !== 'auto') {
    e2eFramework = cfg.e2e_framework;
  } else {
    if ('@playwright/test' in devDeps) {
      e2eFramework = 'playwright';
    } else if ('cypress' in devDeps) {
      e2eFramework = 'cypress';
    } else if ('selenium-webdriver' in devDeps) {
      e2eFramework = 'selenium';
    }

    // Check if frontend project missing e2e
    const frontendFrameworks = ['react', 'vue', 'svelte', 'next'];
    const isFrontend = frontendFrameworks.some(
      (f) => f in deps || f in devDeps,
    );
    if (isFrontend && e2eFramework === null && cfg.prompt_if_missing) {
      e2eMissing = true;
    }
  }

  // ── Docker detection ────────────────────────────────────────────────────
  const composePath = path.join(rootDir, 'docker-compose.yaml');
  let hasDocker = false;
  let dockerServices: string[] = [];

  if (fileExists(composePath)) {
    hasDocker = true;
    const composeRaw = fs.readFileSync(composePath, 'utf-8');
    const compose = parseYaml(composeRaw) ?? {};
    if (compose.services && typeof compose.services === 'object') {
      dockerServices = Object.keys(compose.services);
    }
  }

  // ── .env.example detection ──────────────────────────────────────────────
  const envExamplePath = path.join(rootDir, '.env.example');
  let hasEnvExample = false;
  let envVars: string[] = [];

  if (fileExists(envExamplePath)) {
    hasEnvExample = true;
    const envRaw = fs.readFileSync(envExamplePath, 'utf-8');
    envVars = envRaw
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.startsWith('#');
      })
      .map((line) => line.split('=')[0].trim())
      .filter((key) => key.length > 0);
  }

  // ── Multi-workspace detection ───────────────────────────────────────────
  const workspaces: Record<string, string> = {};
  try {
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const subDir = path.join(rootDir, entry.name);
      const hasPackageJson = fileExists(path.join(subDir, 'package.json'));
      const hasCargoToml = fileExists(path.join(subDir, 'Cargo.toml'));
      const hasGoMod = fileExists(path.join(subDir, 'go.mod'));
      if (hasPackageJson || hasCargoToml || hasGoMod) {
        workspaces[entry.name] = `./${entry.name}`;
      }
    }
  } catch {
    // ignore read errors
  }

  // ── Dev script detection ────────────────────────────────────────────────
  const devScriptFiles = ['dev.sh', 'Makefile', 'Taskfile.yml', 'docker-compose.yaml'];
  const hasDevScript = devScriptFiles.some((f) => fileExists(path.join(rootDir, f)));

  // ── Detected services ───────────────────────────────────────────────────
  const detectedServices: SandboxService[] = [
    {
      name: 'install-deps',
      run: 'npm install',
      when: 'if-missing',
      check: 'node_modules',
    },
  ];

  if (hasDocker && dockerServices.includes('postgres')) {
    detectedServices.push({
      name: 'db',
      run: 'docker-compose up -d postgres',
      background: true,
    });
  }

  const result: DetectionResult & { e2e_missing?: boolean } = {
    project_type: projectType,
    package_manager: projectType === 'node' ? packageManager : null,
    test_runner: testRunner,
    e2e_framework: e2eFramework,
    has_docker: hasDocker,
    docker_services: dockerServices,
    has_dev_script: hasDevScript,
    workspaces,
    has_env_example: hasEnvExample,
    env_vars: envVars,
    scripts,
    detected_services: detectedServices,
  };

  if (e2eMissing !== undefined) {
    result.e2e_missing = e2eMissing;
  }

  return result;
}
