/**
 * Integration tests for `specwork update` CLI command.
 *
 * RED state: the update command does not exist yet — all tests must fail.
 *
 * Covers spec requirements:
 *   1. Version Tracking (CLI level)
 *   2. Manifest-Based Modification Detection (end-to-end)
 *   3. Backup Before Overwrite (end-to-end)
 *   4. Config Schema Migration (end-to-end)
 *   5. Lock-File Workflow Protection (exit code 2)
 *   6. Dry-Run Mode (--dry-run flag)
 *   7. Doctor Version Check Integration
 *   8. Session-Init Version Warning (shell hook)
 *   9. Update Summary Output (human-readable + JSON)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestProject, runSpecwork, cleanup } from './helpers.js';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

describe('specwork update', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestProject();
    runSpecwork(dir, 'init');
  });

  afterEach(() => {
    cleanup(dir);
  });

  // ── Requirement 1: Version Tracking ──────────────────────────────────────

  describe('Version Tracking', () => {
    it('init sets specwork_version in config.yaml', () => {
      const config = parseYaml(
        fs.readFileSync(path.join(dir, '.specwork', 'config.yaml'), 'utf-8'),
      ) as Record<string, unknown>;
      expect(config.specwork_version).toBeDefined();
      expect(typeof config.specwork_version).toBe('string');
    });

    it('update bumps specwork_version to current package version', () => {
      // Downgrade version to simulate older project
      const configPath = path.join(dir, '.specwork', 'config.yaml');
      const config = parseYaml(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      config.specwork_version = '0.0.1';
      fs.writeFileSync(configPath, stringifyYaml(config), 'utf-8');

      const result = runSpecwork(dir, 'update');
      expect(result.exitCode).toBe(0);

      const updated = parseYaml(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      expect(updated.specwork_version).not.toBe('0.0.1');
    });

    it('prints already-up-to-date message when versions match', () => {
      const result = runSpecwork(dir, 'update');
      expect(result.exitCode).toBe(0);
      expect(result.stdout + result.stderr).toMatch(/up.to.date|already|current/i);
    });
  });

  // ── Requirement 2: Manifest-Based Modification Detection ─────────────────

  describe('Manifest-Based Modification Detection', () => {
    it('init creates manifest.yaml', () => {
      const manifestPath = path.join(dir, '.specwork', 'manifest.yaml');
      expect(fs.existsSync(manifestPath)).toBe(true);
    });

    it('manifest contains checksums for managed files', () => {
      const manifestPath = path.join(dir, '.specwork', 'manifest.yaml');
      const manifest = parseYaml(fs.readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
      expect(manifest).toHaveProperty('files');
      const files = manifest.files as Record<string, string>;
      expect(Object.keys(files).length).toBeGreaterThan(0);
    });

    it('update generates fresh manifest for legacy project without manifest', () => {
      // Remove manifest to simulate legacy project
      const manifestPath = path.join(dir, '.specwork', 'manifest.yaml');
      if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);

      // Downgrade version to force update
      const configPath = path.join(dir, '.specwork', 'config.yaml');
      const config = parseYaml(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      config.specwork_version = '0.0.1';
      fs.writeFileSync(configPath, stringifyYaml(config), 'utf-8');

      const result = runSpecwork(dir, 'update');
      expect(result.exitCode).toBe(0);

      // Manifest should now exist
      expect(fs.existsSync(manifestPath)).toBe(true);
    });
  });

  // ── Requirement 3: Backup Before Overwrite ───────────────────────────────

  describe('Backup Before Overwrite', () => {
    it('backs up modified managed files before overwriting', () => {
      // Modify a managed file
      const agentFile = path.join(dir, '.claude', 'agents', 'specwork-implementer.md');
      if (fs.existsSync(agentFile)) {
        fs.writeFileSync(agentFile, '# Custom user modifications\n\nUser-specific content', 'utf-8');
      }

      // Downgrade version to force update
      const configPath = path.join(dir, '.specwork', 'config.yaml');
      const config = parseYaml(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      const prevVersion = config.specwork_version as string;
      config.specwork_version = '0.0.1';
      fs.writeFileSync(configPath, stringifyYaml(config), 'utf-8');

      const result = runSpecwork(dir, 'update');
      expect(result.exitCode).toBe(0);

      // Check that backups directory was created
      const backupsDir = path.join(dir, '.specwork', 'backups');
      expect(fs.existsSync(backupsDir)).toBe(true);
    });

    it('does not back up unmodified files', () => {
      // Downgrade version without modifying any managed files
      const configPath = path.join(dir, '.specwork', 'config.yaml');
      const config = parseYaml(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      config.specwork_version = '0.0.1';
      fs.writeFileSync(configPath, stringifyYaml(config), 'utf-8');

      // Also update manifest to match the downgraded config
      const result = runSpecwork(dir, 'update');
      expect(result.exitCode).toBe(0);

      // Output should not mention backing up files (or zero files backed up)
      expect(result.stdout + result.stderr).not.toMatch(/backed.up.*[1-9]/i);
    });
  });

  // ── Requirement 4: Config Schema Migration ──────────────────────────────

  describe('Config Schema Migration', () => {
    it('adds new default config fields during update', () => {
      // Remove a section from config to simulate old schema
      const configPath = path.join(dir, '.specwork', 'config.yaml');
      const config = parseYaml(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      delete config.environments;
      config.specwork_version = '0.0.1';
      fs.writeFileSync(configPath, stringifyYaml(config), 'utf-8');

      const result = runSpecwork(dir, 'update');
      expect(result.exitCode).toBe(0);

      const updated = parseYaml(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      expect(updated).toHaveProperty('environments');
    });

    it('preserves user-customized config values', () => {
      const configPath = path.join(dir, '.specwork', 'config.yaml');
      const config = parseYaml(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      (config as { models: Record<string, string> }).models.default = 'opus';
      config.specwork_version = '0.0.1';
      fs.writeFileSync(configPath, stringifyYaml(config), 'utf-8');

      const result = runSpecwork(dir, 'update');
      expect(result.exitCode).toBe(0);

      const updated = parseYaml(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      expect((updated as { models: Record<string, string> }).models.default).toBe('opus');
    });

    it('warns about deprecated config fields', () => {
      const configPath = path.join(dir, '.specwork', 'config.yaml');
      const config = parseYaml(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      config.legacy_option = true;
      config.specwork_version = '0.0.1';
      fs.writeFileSync(configPath, stringifyYaml(config), 'utf-8');

      const result = runSpecwork(dir, 'update');
      expect(result.exitCode).toBe(0);
      expect(result.stdout + result.stderr).toMatch(/deprecated|legacy_option/i);
    });

    it('does NOT remove deprecated fields from config', () => {
      const configPath = path.join(dir, '.specwork', 'config.yaml');
      const config = parseYaml(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      config.legacy_option = true;
      config.specwork_version = '0.0.1';
      fs.writeFileSync(configPath, stringifyYaml(config), 'utf-8');

      const result = runSpecwork(dir, 'update');
      // Update must succeed for the preservation check to be meaningful
      expect(result.exitCode).toBe(0);

      const updated = parseYaml(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      expect(updated).toHaveProperty('legacy_option');
    });
  });

  // ── Requirement 5: Lock-File Workflow Protection ────────────────────────

  describe('Lock-File Workflow Protection', () => {
    it('exits with code 2 when workflows are locked', () => {
      const lockDir = path.join(dir, '.specwork', 'graph', 'add-auth');
      fs.mkdirSync(lockDir, { recursive: true });
      fs.writeFileSync(path.join(lockDir, '.lock'), '', 'utf-8');

      const result = runSpecwork(dir, 'update');
      expect(result.exitCode).toBe(2);
    });

    it('error message names the locked change', () => {
      const lockDir = path.join(dir, '.specwork', 'graph', 'add-auth');
      fs.mkdirSync(lockDir, { recursive: true });
      fs.writeFileSync(path.join(lockDir, '.lock'), '', 'utf-8');

      const result = runSpecwork(dir, 'update');
      expect(result.stdout + result.stderr).toMatch(/add-auth/);
    });

    it('does not modify files when blocked by lock', () => {
      const configPath = path.join(dir, '.specwork', 'config.yaml');
      const configBefore = fs.readFileSync(configPath, 'utf-8');

      const lockDir = path.join(dir, '.specwork', 'graph', 'add-auth');
      fs.mkdirSync(lockDir, { recursive: true });
      fs.writeFileSync(path.join(lockDir, '.lock'), '', 'utf-8');

      const result = runSpecwork(dir, 'update');
      // Must exit with BLOCKED code specifically (not generic error)
      expect(result.exitCode).toBe(2);

      const configAfter = fs.readFileSync(configPath, 'utf-8');
      expect(configAfter).toBe(configBefore);
    });

    it('proceeds normally when no lock files exist', () => {
      // Create graph dir without lock
      const graphDir = path.join(dir, '.specwork', 'graph', 'completed');
      fs.mkdirSync(graphDir, { recursive: true });
      fs.writeFileSync(path.join(graphDir, 'graph.yaml'), 'change: completed\n', 'utf-8');

      const result = runSpecwork(dir, 'update');
      expect(result.exitCode).toBe(0);
    });
  });

  // ── Requirement 6: Dry-Run Mode ─────────────────────────────────────────

  describe('Dry-Run Mode', () => {
    it('does not modify any files in dry-run', () => {
      const configPath = path.join(dir, '.specwork', 'config.yaml');
      const config = parseYaml(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      config.specwork_version = '0.0.1';
      fs.writeFileSync(configPath, stringifyYaml(config), 'utf-8');
      const configContent = fs.readFileSync(configPath, 'utf-8');

      const result = runSpecwork(dir, 'update --dry-run');
      expect(result.exitCode).toBe(0);

      // Config should remain unchanged
      expect(fs.readFileSync(configPath, 'utf-8')).toBe(configContent);
    });

    it('shows file statuses in dry-run output', () => {
      const configPath = path.join(dir, '.specwork', 'config.yaml');
      const config = parseYaml(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      config.specwork_version = '0.0.1';
      fs.writeFileSync(configPath, stringifyYaml(config), 'utf-8');

      const result = runSpecwork(dir, 'update --dry-run');
      expect(result.exitCode).toBe(0);
      // Should show some indication of what would change
      expect(result.stdout + result.stderr).toMatch(/create|update|skip|backup|modified|unmodified/i);
    });

    it('shows already-up-to-date in dry-run when current', () => {
      const result = runSpecwork(dir, 'update --dry-run');
      expect(result.exitCode).toBe(0);
      expect(result.stdout + result.stderr).toMatch(/up.to.date|already|current/i);
    });

    it('does not create backups in dry-run mode', () => {
      // Modify a managed file
      const agentFile = path.join(dir, '.claude', 'agents', 'specwork-implementer.md');
      if (fs.existsSync(agentFile)) {
        fs.writeFileSync(agentFile, '# User modified\n', 'utf-8');
      }

      const configPath = path.join(dir, '.specwork', 'config.yaml');
      const config = parseYaml(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      config.specwork_version = '0.0.1';
      fs.writeFileSync(configPath, stringifyYaml(config), 'utf-8');

      const result = runSpecwork(dir, 'update --dry-run');
      // Dry-run must be recognized as a valid flag and succeed
      expect(result.exitCode).toBe(0);
      expect(result.stdout + result.stderr).toMatch(/dry.run|preview|would/i);

      // No backups should be created
      const backupsDir = path.join(dir, '.specwork', 'backups');
      if (fs.existsSync(backupsDir)) {
        const backupContents = fs.readdirSync(backupsDir);
        expect(backupContents).toHaveLength(0);
      }
    });
  });

  // ── Requirement 7: Doctor Version Check Integration ─────────────────────

  describe('Doctor Version Check', () => {
    it('doctor reports passing version check when current', () => {
      const result = runSpecwork(dir, '--json doctor');
      expect(result.exitCode).toBe(0);

      const report = JSON.parse(result.stdout) as { checks: Array<{ category: string; results: Array<{ pass: boolean; label: string }> }> };
      const versionCheck = report.checks.find((c) => c.category === 'Version');
      expect(versionCheck).toBeDefined();

      const versionResults = versionCheck!.results;
      expect(versionResults.length).toBeGreaterThan(0);
      expect(versionResults[0].pass).toBe(true);
    });

    it('doctor reports failing version check on mismatch', () => {
      // Downgrade version
      const configPath = path.join(dir, '.specwork', 'config.yaml');
      const config = parseYaml(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      config.specwork_version = '0.0.1';
      fs.writeFileSync(configPath, stringifyYaml(config), 'utf-8');

      const result = runSpecwork(dir, '--json doctor');
      const report = JSON.parse(result.stdout) as { checks: Array<{ category: string; results: Array<{ pass: boolean; detail?: string; fixable?: boolean }> }> };
      const versionCheck = report.checks.find((c) => c.category === 'Version');
      expect(versionCheck).toBeDefined();

      const failing = versionCheck!.results.filter((r) => !r.pass);
      expect(failing.length).toBeGreaterThan(0);
      expect(failing[0].detail).toMatch(/0\.0\.1/);
      expect(failing[0].fixable).toBe(true);
    });

    it('doctor reports failing check when specwork_version is missing', () => {
      const configPath = path.join(dir, '.specwork', 'config.yaml');
      const config = parseYaml(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      delete config.specwork_version;
      fs.writeFileSync(configPath, stringifyYaml(config), 'utf-8');

      const result = runSpecwork(dir, '--json doctor');
      const report = JSON.parse(result.stdout) as { checks: Array<{ category: string; results: Array<{ pass: boolean; detail?: string }> }> };
      const versionCheck = report.checks.find((c) => c.category === 'Version');
      expect(versionCheck).toBeDefined();

      const failing = versionCheck!.results.filter((r) => !r.pass);
      expect(failing.length).toBeGreaterThan(0);
      expect(failing[0].detail).toMatch(/no.*version|missing/i);
    });
  });

  // ── Requirement 8: Session-Init Version Warning ─────────────────────────

  describe('Session-Init Version Warning', () => {
    it('session-init.sh warns on version mismatch', () => {
      // Downgrade version
      const configPath = path.join(dir, '.specwork', 'config.yaml');
      const config = parseYaml(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      config.specwork_version = '0.0.1';
      fs.writeFileSync(configPath, stringifyYaml(config), 'utf-8');

      // Run the session-init hook directly
      const hookPath = path.join(dir, '.claude', 'hooks', 'session-init.sh');
      if (fs.existsSync(hookPath)) {
        const { execSync } = require('node:child_process');
        const output = execSync(`bash "${hookPath}"`, { cwd: dir, encoding: 'utf-8', stdio: 'pipe' });
        expect(output).toMatch(/specwork update|version|mismatch|0\.0\.1/i);
      } else {
        // Hook doesn't exist yet — this is expected in RED state
        expect(fs.existsSync(hookPath)).toBe(true);
      }
    });

    it('session-init.sh does not warn when version is current', () => {
      // The session-init hook must exist and contain version check logic
      const hookPath = path.join(dir, '.claude', 'hooks', 'session-init.sh');
      expect(fs.existsSync(hookPath)).toBe(true);

      const hookContent = fs.readFileSync(hookPath, 'utf-8');
      // Hook must contain version comparison logic
      expect(hookContent).toMatch(/specwork_version|version/i);

      const { execSync } = require('node:child_process');
      const output = execSync(`bash "${hookPath}"`, { cwd: dir, encoding: 'utf-8', stdio: 'pipe' });
      expect(output).not.toMatch(/specwork update|mismatch/i);
    });
  });

  // ── Requirement 9: Update Summary Output ────────────────────────────────

  describe('Update Summary Output', () => {
    it('prints human-readable summary after update', () => {
      const configPath = path.join(dir, '.specwork', 'config.yaml');
      const config = parseYaml(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      config.specwork_version = '0.0.1';
      fs.writeFileSync(configPath, stringifyYaml(config), 'utf-8');

      const result = runSpecwork(dir, 'update');
      expect(result.exitCode).toBe(0);

      const output = result.stdout + result.stderr;
      // Should mention files updated, version, etc.
      expect(output).toMatch(/updated|files|version/i);
    });

    it('outputs structured JSON with --json flag', () => {
      const configPath = path.join(dir, '.specwork', 'config.yaml');
      const config = parseYaml(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      config.specwork_version = '0.0.1';
      fs.writeFileSync(configPath, stringifyYaml(config), 'utf-8');

      const result = runSpecwork(dir, '--json update');
      expect(result.exitCode).toBe(0);

      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed).toHaveProperty('updated');
      expect(parsed).toHaveProperty('backedUp');
      expect(parsed).toHaveProperty('configFieldsAdded');
      expect(parsed).toHaveProperty('previousVersion');
      expect(parsed).toHaveProperty('newVersion');
      expect(parsed).toHaveProperty('backupPath');
    });
  });
});
