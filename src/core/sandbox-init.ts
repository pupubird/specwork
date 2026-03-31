import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import net from 'node:net';
import { parse } from 'yaml';
import type {
  SandboxConfig,
  SandboxService,
  SandboxState,
  ServiceState,
  SandboxChangeConfig,
  OutputCapture,
} from '../types/sandbox.js';
import { generateEnvFile, propagateOutputs } from './sandbox-env.js';

// ── resolveServiceOrder ──────────────────────────────────────────────────────

export function resolveServiceOrder(services: SandboxService[]): SandboxService[] {
  const nameToService = new Map(services.map(s => [s.name, s]));
  const inDegree = new Map<string, number>(services.map(s => [s.name, 0]));
  const adjacency = new Map<string, string[]>(services.map(s => [s.name, []]));

  for (const service of services) {
    const deps = service.after
      ? Array.isArray(service.after) ? service.after : [service.after]
      : [];
    for (const dep of deps) {
      adjacency.get(dep)?.push(service.name);
      inDegree.set(service.name, (inDegree.get(service.name) ?? 0) + 1);
    }
  }

  // Kahn's algorithm — preserve original order by seeding queue in input order
  const queue: string[] = [];
  for (const service of services) {
    if ((inDegree.get(service.name) ?? 0) === 0) {
      queue.push(service.name);
    }
  }

  const result: SandboxService[] = [];
  while (queue.length > 0) {
    const name = queue.shift()!;
    result.push(nameToService.get(name)!);
    for (const next of adjacency.get(name) ?? []) {
      const newDegree = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, newDegree);
      if (newDegree === 0) {
        queue.push(next);
      }
    }
  }

  if (result.length !== services.length) {
    throw new Error('Circular dependency detected in service definitions');
  }

  return result;
}

// ── checkPortConflicts ───────────────────────────────────────────────────────

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(false));
    });
    server.on('error', (err: NodeJS.ErrnoException) => {
      resolve(err.code === 'EADDRINUSE');
    });
  });
}

function getPidForPort(port: number): number {
  try {
    const result = execSync(`lsof -i :${port} -t`, { encoding: 'utf-8' }).trim();
    const pid = parseInt(result.split('\n')[0]!, 10);
    return isNaN(pid) ? 0 : pid;
  } catch {
    return 0;
  }
}

export async function checkPortConflicts(
  services: SandboxService[],
): Promise<Array<{ service: string; port: number; pid: number }>> {
  const conflicts: Array<{ service: string; port: number; pid: number }> = [];

  for (const service of services) {
    if (!service.ports || service.ports.length === 0) continue;
    for (const port of service.ports) {
      if (await isPortInUse(port)) {
        const pid = getPidForPort(port);
        conflicts.push({ service: service.name, port, pid });
      }
    }
  }

  return conflicts;
}

// ── resolveConfig ────────────────────────────────────────────────────────────

export async function resolveConfig(
  rootDir: string,
  change: string,
  profile?: string,
): Promise<SandboxConfig> {
  const basePath = path.join(rootDir, '.specwork', 'sandbox.yaml');
  if (!fs.existsSync(basePath)) {
    throw new Error(`No sandbox.yaml found at ${basePath}`);
  }

  const baseConfig: SandboxConfig = parse(fs.readFileSync(basePath, 'utf-8'));
  let services = [...baseConfig.services];
  let effectiveProfile: string | undefined = profile;

  const changePath = path.join(rootDir, '.specwork', 'changes', change, 'sandbox.yaml');
  if (fs.existsSync(changePath)) {
    const changeConfig: SandboxChangeConfig = parse(fs.readFileSync(changePath, 'utf-8'));

    if (changeConfig.skip) {
      services = services.filter(s => !changeConfig.skip!.includes(s.name));
    }

    if (changeConfig.services) {
      services = [...services, ...changeConfig.services];
    }

    if (!effectiveProfile && changeConfig.profile) {
      effectiveProfile = changeConfig.profile;
    }
  }

  if (!effectiveProfile && baseConfig.default_profile) {
    effectiveProfile = baseConfig.default_profile;
  }

  if (effectiveProfile && baseConfig.profiles?.[effectiveProfile]) {
    const profileNames = baseConfig.profiles[effectiveProfile];
    services = services.filter(s => profileNames.includes(s.name));
  }

  return { ...baseConfig, services };
}

// ── initSandbox ──────────────────────────────────────────────────────────────

function resolveCwd(
  cwd: string | undefined,
  workspaces: Record<string, string> | undefined,
  rootDir: string,
): string {
  if (!cwd) return rootDir;
  if (workspaces?.[cwd]) return path.join(rootDir, workspaces[cwd]!);
  return path.join(rootDir, cwd);
}

function captureOutputs(
  stdout: string,
  outputs: OutputCapture[],
  captured: Record<string, string>,
): void {
  for (const output of outputs) {
    if (output.from === 'stdout') {
      const match = stdout.match(new RegExp(output.pattern));
      if (match?.[1] !== undefined) {
        captured[output.var] = match[1];
      }
    }
  }
}

async function waitForReady(
  readyCheck: NonNullable<SandboxService['ready_check']>,
  rootDir: string,
): Promise<void> {
  const intervalMs = (readyCheck.interval ?? 1) * 1000;
  const timeoutMs = readyCheck.timeout * 1000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      if (readyCheck.command) {
        execSync(readyCheck.command, { cwd: rootDir, stdio: 'pipe' });
        return;
      }
      if (readyCheck.url) {
        const http = await import('node:http');
        await new Promise<void>((resolve, reject) => {
          http.get(readyCheck.url!, (res) => {
            if (res.statusCode && res.statusCode < 500) resolve();
            else reject(new Error(`HTTP ${res.statusCode}`));
          }).on('error', reject);
        });
        return;
      }
      return;
    } catch {
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }
  // Timeout — don't throw, just continue
}

async function executeService(
  service: SandboxService,
  config: SandboxConfig,
  rootDir: string,
  capturedOutputs: Record<string, string>,
): Promise<ServiceState> {
  // if-missing check
  if (service.when === 'if-missing' && service.check) {
    const checkPath = path.join(rootDir, service.check);
    if (fs.existsSync(checkPath)) {
      return { name: service.name, status: 'stopped' };
    }
  }

  let pid: number | undefined;

  try {
    if (service.steps) {
      for (const step of service.steps) {
        const cwd = resolveCwd(step.cwd, config.workspaces, rootDir);
        const stdout = execSync(step.run, { cwd, encoding: 'utf-8', stdio: 'pipe' });
        if (step.outputs) {
          captureOutputs(stdout, step.outputs, capturedOutputs);
        }
        if (step.propagate_to && step.propagate_to.length > 0) {
          await propagateOutputs(capturedOutputs, step.propagate_to, rootDir);
        }
      }
      if (service.propagate_to && service.propagate_to.length > 0) {
        await propagateOutputs(capturedOutputs, service.propagate_to, rootDir);
      }
      return { name: service.name, status: 'stopped' };
    }

    if (service.run) {
      const cwd = resolveCwd(service.cwd, config.workspaces, rootDir);

      if (service.background) {
        const child = spawn(service.run, {
          shell: true,
          cwd,
          detached: true,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        pid = child.pid;
        child.unref();

        if (service.ready_check) {
          await waitForReady(service.ready_check, rootDir);
        }

        return { name: service.name, pid, status: 'running' };
      } else {
        const stdout = execSync(service.run, { cwd, encoding: 'utf-8', stdio: 'pipe' });
        if (service.outputs) {
          captureOutputs(stdout, service.outputs, capturedOutputs);
        }
        if (service.propagate_to && service.propagate_to.length > 0) {
          await propagateOutputs(capturedOutputs, service.propagate_to, rootDir);
        }
        return { name: service.name, status: 'stopped' };
      }
    }

    return { name: service.name, status: 'stopped' };
  } catch {
    return { name: service.name, status: 'failed' };
  }
}

export async function initSandbox(
  rootDir: string,
  change: string,
  options?: { dryRun?: boolean; profile?: string },
): Promise<SandboxState> {
  const config = await resolveConfig(rootDir, change, options?.profile);
  const ordered = resolveServiceOrder(config.services);

  if (!options?.dryRun) {
    // Check port conflicts before starting any services
    const conflicts = await checkPortConflicts(ordered);
    if (conflicts.length > 0) {
      const msgs = conflicts.map(c => `Port ${c.port} (${c.service}) in use by PID ${c.pid}`);
      throw new Error(`Port conflicts detected:\n${msgs.join('\n')}`);
    }

    // Generate .env.test if env config exists
    if (config.env) {
      await generateEnvFile(rootDir, config.env);
    }
  }

  const capturedOutputs: Record<string, string> = {};
  const serviceStates: ServiceState[] = [];

  for (const service of ordered) {
    if (!options?.dryRun) {
      const state = await executeService(service, config, rootDir, capturedOutputs);
      serviceStates.push(state);
    } else {
      serviceStates.push({ name: service.name, status: 'stopped' });
    }
  }

  const sandboxState: SandboxState = {
    change,
    profile: options?.profile ?? config.default_profile ?? '',
    started_at: new Date().toISOString(),
    services: serviceStates,
    captured_outputs: capturedOutputs,
  };

  if (!options?.dryRun) {
    const statePath = path.join(rootDir, '.specwork', 'sandbox', 'state.json');
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(sandboxState, null, 2), 'utf-8');
  }

  return sandboxState;
}
