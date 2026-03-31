import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { parse } from 'yaml';

import type { SandboxConfig, SandboxState, ServiceState, TeardownConfig } from '../types/sandbox.js';

export async function teardownSandbox(rootDir: string, change: string): Promise<void> {
  const stateFile = path.join(rootDir, '.specwork', 'sandbox', 'state.json');

  if (!fs.existsSync(stateFile)) {
    return;
  }

  const raw = fs.readFileSync(stateFile, 'utf-8');
  const state: SandboxState = JSON.parse(raw);

  // Kill tracked PIDs
  for (const service of state.services) {
    if (service.reused) continue;
    if (service.pid == null) continue;

    try {
      process.kill(service.pid, 'SIGTERM');
    } catch (err: any) {
      if (err.code !== 'ESRCH') throw err;
    }
  }

  // Run teardown commands and clean paths from config
  const configPath = path.join(rootDir, '.specwork', 'sandbox.yaml');
  if (fs.existsSync(configPath)) {
    try {
      const config: SandboxConfig = parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.teardown?.commands) {
        for (const cmd of config.teardown.commands) {
          try {
            execSync(cmd, { cwd: rootDir, stdio: 'pipe' });
          } catch {
            // Teardown command failures are non-fatal
          }
        }
      }
      if (config.teardown?.cleanup_paths) {
        for (const p of config.teardown.cleanup_paths) {
          const abs = path.join(rootDir, p);
          if (fs.existsSync(abs)) {
            fs.rmSync(abs, { recursive: true, force: true });
          }
        }
      }
    } catch {
      // Config read failures during teardown are non-fatal
    }
  }

  fs.unlinkSync(stateFile);
}
