/**
 * Tests for sandbox environment variable generation — .env.test from .env.example + defaults.
 *
 * Tests are written RED-first: sandbox-env.ts doesn't exist yet.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { generateEnvFile, propagateOutputs } from '../../core/sandbox-env.js';
import type { EnvConfig } from '../../types/sandbox.js';

// ── helpers ──────────────────────────────────────────────────────────────────

let root: string;

function writeFile(relPath: string, content: string): void {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(root, relPath), 'utf-8');
}

// ── Test Environment File Generation ─────────────────────────────────────────

describe('generateEnvFile', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-sandbox-env-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  // ── Scenario: Generate .env.test from .env.example ─────────────────────

  it('scenario: Generate .env.test from .env.example', async () => {
    writeFile('.env.example', 'DATABASE_URL=postgresql://localhost:5432/myapp\nNODE_ENV=development\n');

    const config: EnvConfig = {
      template: '.env.example',
      output: '.env.test',
      defaults: {
        DATABASE_URL: 'postgresql://localhost:5432/test_db',
        NODE_ENV: 'test',
      },
    };

    await generateEnvFile(root, config);

    const content = readFile('.env.test');
    expect(content).toContain('DATABASE_URL=postgresql://localhost:5432/test_db');
    expect(content).toContain('NODE_ENV=test');
    // Original values should be overridden
    expect(content).not.toContain('DATABASE_URL=postgresql://localhost:5432/myapp');
    expect(content).not.toContain('NODE_ENV=development');
  });

  // ── Scenario: No template file exists ──────────────────────────────────

  it('scenario: No template file exists', async () => {
    const config: EnvConfig = {
      template: '.env.example',
      output: '.env.test',
      defaults: { NODE_ENV: 'test' },
    };

    // Should not throw — just skip
    await generateEnvFile(root, config);

    // Output file should NOT be created
    expect(fs.existsSync(path.join(root, '.env.test'))).toBe(false);
  });

  // ── Scenario: Template with variables not in defaults ──────────────────

  it('scenario: Template with variables not in defaults', async () => {
    writeFile('.env.example', 'API_KEY=changeme\nPORT=3000\n');

    const config: EnvConfig = {
      template: '.env.example',
      output: '.env.test',
      defaults: {
        PORT: '3001',
      },
    };

    await generateEnvFile(root, config);

    const content = readFile('.env.test');
    expect(content).toContain('API_KEY=changeme');  // original preserved
    expect(content).toContain('PORT=3001');          // overridden
    expect(content).not.toContain('PORT=3000');
  });

  // ── Edge Cases ─────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('handles empty template file', async () => {
      writeFile('.env.example', '');

      const config: EnvConfig = {
        template: '.env.example',
        output: '.env.test',
        defaults: { NODE_ENV: 'test' },
      };

      await generateEnvFile(root, config);

      // Should still write defaults even if template is empty
      const content = readFile('.env.test');
      expect(content).toContain('NODE_ENV=test');
    });

    it('handles template with comments and blank lines', async () => {
      writeFile('.env.example', '# Database config\nDATABASE_URL=localhost\n\n# App config\nPORT=3000\n');

      const config: EnvConfig = {
        template: '.env.example',
        output: '.env.test',
        defaults: { PORT: '4000' },
      };

      await generateEnvFile(root, config);

      const content = readFile('.env.test');
      expect(content).toContain('PORT=4000');
      expect(content).toContain('DATABASE_URL=localhost');
    });

    it('handles template with quoted values', async () => {
      writeFile('.env.example', 'SECRET="my secret value"\nKEY=plain\n');

      const config: EnvConfig = {
        template: '.env.example',
        output: '.env.test',
        defaults: {},
      };

      await generateEnvFile(root, config);

      const content = readFile('.env.test');
      expect(content).toContain('SECRET="my secret value"');
    });

    it('writes output to custom path', async () => {
      writeFile('.env.example', 'FOO=bar\n');

      const config: EnvConfig = {
        template: '.env.example',
        output: 'config/.env.testing',
        defaults: {},
      };

      await generateEnvFile(root, config);

      expect(fs.existsSync(path.join(root, 'config', '.env.testing'))).toBe(true);
    });
  });
});

// ── Output Propagation ───────────────────────────────────────────────────────

describe('propagateOutputs', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'specwork-sandbox-propagate-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('scenario: Propagate captured output to file', async () => {
    const outputs: Record<string, string> = {
      USDC_MINT: 'abc123',
      PROGRAM_ID: 'xyz789',
    };
    const targets = ['webapp/.env.local'];

    await propagateOutputs(outputs, targets, root);

    const content = readFile('webapp/.env.local');
    expect(content).toContain('USDC_MINT=abc123');
    expect(content).toContain('PROGRAM_ID=xyz789');
  });

  it('propagates to multiple target files', async () => {
    const outputs: Record<string, string> = { API_URL: 'http://localhost:3000' };
    const targets = ['frontend/.env.local', 'backend/.env'];

    await propagateOutputs(outputs, targets, root);

    expect(readFile('frontend/.env.local')).toContain('API_URL=http://localhost:3000');
    expect(readFile('backend/.env')).toContain('API_URL=http://localhost:3000');
  });

  it('handles empty outputs gracefully', async () => {
    const outputs: Record<string, string> = {};
    const targets = ['webapp/.env.local'];

    // Should not throw
    await propagateOutputs(outputs, targets, root);
  });

  it('handles empty targets gracefully', async () => {
    const outputs: Record<string, string> = { FOO: 'bar' };
    const targets: string[] = [];

    // Should not throw
    await propagateOutputs(outputs, targets, root);
  });
});
