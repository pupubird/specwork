/**
 * Tests for sandbox detection engine — scans project infrastructure and produces DetectionResult.
 *
 * Tests are written RED-first: sandbox-detect.ts doesn't exist yet.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { detectProject } from '../../core/sandbox-detect.js';
import type { DetectionResult, DetectConfig } from '../../types/sandbox.js';

// ── helpers ──────────────────────────────────────────────────────────────────

let root: string;

function writeJson(relPath: string, data: unknown): void {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(data, null, 2), 'utf-8');
}

function writeFile(relPath: string, content: string): void {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

function defaultDetectConfig(): DetectConfig {
  return {
    test_runner: 'auto',
    e2e_framework: 'auto',
    prompt_if_missing: false,
  };
}

// ── Project Infrastructure Detection ─────────────────────────────────────────

describe('detectProject', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-sandbox-detect-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  // ── Scenario: Node project with vitest and Docker database ─────────────

  it('scenario: Node project with vitest and Docker database', async () => {
    writeJson('package.json', {
      name: 'test-project',
      devDependencies: { vitest: '^1.0.0' },
      scripts: { test: 'vitest' },
    });
    writeFile('docker-compose.yaml', `
services:
  postgres:
    image: postgres:15
    ports:
      - "5432:5432"
`);
    writeFile('.env.example', 'DATABASE_URL=postgresql://localhost:5432/myapp\nNODE_ENV=development\n');

    const result = await detectProject(root, defaultDetectConfig());

    expect(result.project_type).toBe('node');
    expect(result.test_runner).toBe('vitest');
    expect(result.has_docker).toBe(true);
    expect(result.docker_services).toContain('postgres');
    expect(result.has_env_example).toBe(true);
    expect(result.detected_services.some(s => s.name === 'install-deps')).toBe(true);
    expect(result.detected_services.some(s => s.name === 'db')).toBe(true);
  });

  // ── Scenario: Minimal project with no infrastructure ───────────────────

  it('scenario: Minimal project with no infrastructure', async () => {
    writeJson('package.json', {
      name: 'minimal-project',
      dependencies: {},
    });

    const result = await detectProject(root, defaultDetectConfig());

    expect(result.project_type).toBe('node');
    expect(result.test_runner).toBeNull();
    expect(result.has_docker).toBe(false);
    expect(result.docker_services).toEqual([]);
    expect(result.has_env_example).toBe(false);
    expect(result.detected_services.length).toBeGreaterThanOrEqual(1);
    expect(result.detected_services.some(s => s.name === 'install-deps')).toBe(true);
  });

  // ── Scenario: Test runner auto-detection priority ──────────────────────

  it('scenario: Test runner auto-detection priority (vitest > jest > mocha)', async () => {
    writeJson('package.json', {
      name: 'multi-runner',
      devDependencies: {
        vitest: '^1.0.0',
        jest: '^29.0.0',
        mocha: '^10.0.0',
      },
    });

    const result = await detectProject(root, defaultDetectConfig());

    expect(result.test_runner).toBe('vitest');
  });

  it('prefers jest over mocha when vitest is absent', async () => {
    writeJson('package.json', {
      name: 'jest-mocha',
      devDependencies: {
        jest: '^29.0.0',
        mocha: '^10.0.0',
      },
    });

    const result = await detectProject(root, defaultDetectConfig());

    expect(result.test_runner).toBe('jest');
  });

  // ── E2E Framework Detection ────────────────────────────────────────────

  describe('E2E Framework Detection', () => {
    it('scenario: Playwright detected from devDependencies', async () => {
      writeJson('package.json', {
        name: 'playwright-project',
        devDependencies: { '@playwright/test': '^1.40.0' },
      });

      const result = await detectProject(root, defaultDetectConfig());

      expect(result.e2e_framework).toBe('playwright');
    });

    it('scenario: Frontend project with no e2e framework', async () => {
      writeJson('package.json', {
        name: 'react-app',
        dependencies: { react: '^18.0.0' },
        devDependencies: {},
      });

      const config: DetectConfig = {
        test_runner: 'auto',
        e2e_framework: 'auto',
        prompt_if_missing: true,
      };

      const result = await detectProject(root, config);

      expect(result.e2e_framework).toBeNull();
      expect((result as any).e2e_missing).toBe(true);
    });
  });

  // ── Multi-Workspace Detection ──────────────────────────────────────────

  describe('Multi-Workspace Detection', () => {
    it('scenario: Monorepo with webapp and backend', async () => {
      writeJson('package.json', { name: 'monorepo' });
      writeJson('webapp/package.json', { name: 'webapp' });
      writeJson('backend/package.json', { name: 'backend' });

      const result = await detectProject(root, defaultDetectConfig());

      expect(result.workspaces).toEqual(
        expect.objectContaining({
          webapp: './webapp',
          backend: './backend',
        }),
      );
    });

    it('scenario: Single-project (no workspaces)', async () => {
      writeJson('package.json', { name: 'single-project' });

      const result = await detectProject(root, defaultDetectConfig());

      const keys = Object.keys(result.workspaces);
      expect(keys.length <= 1).toBe(true);
    });
  });

  // ── Existing Dev Script Detection ──────────────────────────────────────

  describe('Existing Dev Script Detection', () => {
    it('scenario: Project with dev.sh', async () => {
      writeJson('package.json', { name: 'dev-script-project' });
      writeFile('dev.sh', '#!/bin/bash\nnpm run dev\n');
      fs.chmodSync(path.join(root, 'dev.sh'), 0o755);

      const result = await detectProject(root, defaultDetectConfig());

      expect(result.has_dev_script).toBe(true);
    });

    it('detects Makefile as dev script', async () => {
      writeJson('package.json', { name: 'makefile-project' });
      writeFile('Makefile', 'dev:\n\tnpm run dev\n');

      const result = await detectProject(root, defaultDetectConfig());

      expect(result.has_dev_script).toBe(true);
    });

    it('detects Taskfile.yml as dev script', async () => {
      writeJson('package.json', { name: 'taskfile-project' });
      writeFile('Taskfile.yml', 'version: 3\ntasks:\n  dev:\n    cmd: npm run dev\n');

      const result = await detectProject(root, defaultDetectConfig());

      expect(result.has_dev_script).toBe(true);
    });

    it('reports has_dev_script false when none exist', async () => {
      writeJson('package.json', { name: 'no-scripts' });

      const result = await detectProject(root, defaultDetectConfig());

      expect(result.has_dev_script).toBe(false);
    });
  });

  // ── Edge Cases ─────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('handles empty project directory gracefully', async () => {
      // No package.json at all
      const result = await detectProject(root, defaultDetectConfig());

      expect(result.project_type).toBe('unknown');
      expect(result.test_runner).toBeNull();
      expect(result.has_docker).toBe(false);
    });

    it('handles malformed package.json', async () => {
      writeFile('package.json', '{ invalid json !!!');

      await expect(detectProject(root, defaultDetectConfig())).rejects.toThrow();
    });

    it('handles docker-compose.yaml without services key', async () => {
      writeJson('package.json', { name: 'test' });
      writeFile('docker-compose.yaml', 'version: "3"\n');

      const result = await detectProject(root, defaultDetectConfig());

      expect(result.has_docker).toBe(true);
      expect(result.docker_services).toEqual([]);
    });

    it('reads env vars from .env.example', async () => {
      writeJson('package.json', { name: 'test' });
      writeFile('.env.example', 'DATABASE_URL=foo\nAPI_KEY=bar\nSECRET=baz\n');

      const result = await detectProject(root, defaultDetectConfig());

      expect(result.has_env_example).toBe(true);
      expect(result.env_vars).toContain('DATABASE_URL');
      expect(result.env_vars).toContain('API_KEY');
      expect(result.env_vars).toContain('SECRET');
    });

    it('extracts scripts from package.json', async () => {
      writeJson('package.json', {
        name: 'scripts-project',
        scripts: { dev: 'next dev', build: 'next build', test: 'vitest' },
        devDependencies: { vitest: '^1.0.0' },
      });

      const result = await detectProject(root, defaultDetectConfig());

      expect(result.scripts).toEqual(
        expect.objectContaining({
          dev: 'next dev',
          build: 'next build',
          test: 'vitest',
        }),
      );
    });

    it('returns consistent results on repeated calls (idempotent)', async () => {
      writeJson('package.json', { name: 'idem', devDependencies: { vitest: '1.0.0' } });

      const result1 = await detectProject(root, defaultDetectConfig());
      const result2 = await detectProject(root, defaultDetectConfig());

      expect(result1).toEqual(result2);
    });
  });
});
