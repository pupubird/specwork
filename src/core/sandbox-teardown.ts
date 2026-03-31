import fs from 'node:fs';
import path from 'node:path';

import type { SandboxState, ServiceState } from '../types/sandbox.js';

export async function teardownSandbox(rootDir: string, change: string): Promise<void> {
  const stateFile = path.join(rootDir, '.specwork', 'sandbox', 'state.json');

  if (!fs.existsSync(stateFile)) {
    return;
  }

  const raw = fs.readFileSync(stateFile, 'utf-8');
  const state: SandboxState = JSON.parse(raw);

  for (const service of state.services) {
    if (service.reused) continue;
    if (service.pid == null) continue;

    try {
      process.kill(service.pid, 'SIGTERM');
    } catch (err: any) {
      if (err.code !== 'ESRCH') throw err;
    }
  }

  fs.unlinkSync(stateFile);
}
