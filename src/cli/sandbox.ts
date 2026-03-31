import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { findSpecworkRoot } from '../utils/paths.js';
import { output, table } from '../utils/output.js';
import { initSandbox } from '../core/sandbox-init.js';
import { teardownSandbox } from '../core/sandbox-teardown.js';
import { detectProject } from '../core/sandbox-detect.js';

export function makeSandboxCommand(): Command {
  const cmd = new Command('sandbox')
    .description('Manage sandbox environments for agent testing');

  cmd.addCommand(
    new Command('init')
      .description('Initialize sandbox environment')
      .argument('[change]', 'Change name')
      .option('--dry-run', 'Show plan without executing')
      .option('--profile <name>', 'Use a specific profile')
      .action(async (change: string | undefined, opts: { dryRun?: boolean; profile?: string }, subcmd: Command) => {
        const root = findSpecworkRoot();
        const jsonMode = (subcmd.parent?.parent?.opts() as { json?: boolean })?.json ?? false;

        const state = await initSandbox(root, change ?? '', {
          dryRun: opts.dryRun,
          profile: opts.profile,
        });

        if (jsonMode) {
          output({
            success: true,
            services: state.services,
            state_file: '.specwork/sandbox/state.json',
          }, { json: true, quiet: false });
        } else {
          process.stdout.write(`Sandbox initialized for change: ${change ?? '(none)'}\n`);
          if (state.services.length > 0) {
            table(
              ['Service', 'Status', 'PID'],
              state.services.map(s => [s.name, s.status, String(s.pid ?? '')]),
            );
          }
        }
      })
  );

  cmd.addCommand(
    new Command('teardown')
      .description('Tear down sandbox environment')
      .argument('[change]', 'Change name')
      .action(async (change: string | undefined, _opts: unknown, subcmd: Command) => {
        const root = findSpecworkRoot();
        const jsonMode = (subcmd.parent?.parent?.opts() as { json?: boolean })?.json ?? false;

        await teardownSandbox(root, change ?? '');

        if (jsonMode) {
          output({ success: true }, { json: true, quiet: false });
        } else {
          process.stdout.write('Sandbox torn down.\n');
        }
      })
  );

  cmd.addCommand(
    new Command('status')
      .description('Show sandbox status')
      .action((_opts: unknown, subcmd: Command) => {
        const root = findSpecworkRoot();
        const jsonMode = (subcmd.parent?.parent?.opts() as { json?: boolean })?.json ?? false;

        const stateFile = path.join(root, '.specwork', 'sandbox', 'state.json');

        if (!fs.existsSync(stateFile)) {
          if (jsonMode) {
            output({ services: [] }, { json: true, quiet: false });
          } else {
            process.stdout.write('No active sandbox state found.\n');
          }
          return;
        }

        const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));

        if (jsonMode) {
          output(state, { json: true, quiet: false });
        } else {
          process.stdout.write(`Change: ${state.change}  Profile: ${state.profile}\n`);
          process.stdout.write(`Started: ${state.started_at}\n\n`);
          if (state.services?.length > 0) {
            table(
              ['Service', 'Status', 'PID'],
              state.services.map((s: { name: string; status: string; pid?: number }) => [
                s.name,
                s.status,
                String(s.pid ?? ''),
              ]),
            );
          }
        }
      })
  );

  cmd.addCommand(
    new Command('detect')
      .description('Detect project type and services')
      .action(async (_opts: unknown, subcmd: Command) => {
        const root = findSpecworkRoot();
        const jsonMode = (subcmd.parent?.parent?.opts() as { json?: boolean })?.json ?? false;

        const result = await detectProject(root);

        if (jsonMode) {
          output(result, { json: true, quiet: false });
        } else {
          process.stdout.write(`Project type: ${result.project_type}\n`);
          process.stdout.write(`Package manager: ${result.package_manager ?? 'none'}\n`);
          process.stdout.write(`Test runner: ${result.test_runner ?? 'none'}\n`);
          process.stdout.write(`E2E framework: ${result.e2e_framework ?? 'none'}\n`);
          process.stdout.write(`Has Docker: ${result.has_docker}\n`);
          if (result.detected_services.length > 0) {
            process.stdout.write('\nDetected services:\n');
            table(
              ['Name', 'Run', 'When'],
              result.detected_services.map(s => [s.name, s.run ?? '', s.when ?? '']),
            );
          }
        }
      })
  );

  return cmd;
}
