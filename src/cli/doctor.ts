import { Command } from 'commander';
import { findForemanRoot } from '../utils/paths.js';
import { output } from '../utils/output.js';
import { runDoctor, applyFixes } from '../core/doctor.js';
import type { DoctorReport, CheckResult, DiagnosticResult } from '../core/doctor.js';

function formatReport(report: DoctorReport): string {
  const lines: string[] = [];

  for (const check of report.checks) {
    lines.push(`\n${check.category}`);
    for (const r of check.results) {
      const icon = r.pass ? '  ✓' : '  ✗';
      const detail = r.detail ? ` — ${r.detail}` : '';
      const fixable = !r.pass && r.fixable ? ' (fixable)' : '';
      lines.push(`${icon} ${r.label}${detail}${fixable}`);
    }
  }

  lines.push('');
  lines.push('─'.repeat(40));
  lines.push(`Results: ${report.totalPass} passed, ${report.totalFail} failed`);
  if (report.totalFixable > 0) {
    lines.push(`Run \`foreman doctor --fix\` to auto-repair fixable issues (${report.totalFixable} fixable)`);
  }

  return lines.join('\n');
}

function stripFix(report: DoctorReport): DoctorReport {
  return {
    ...report,
    checks: report.checks.map(c => ({
      ...c,
      results: c.results.map(r => {
        const { fix, ...rest } = r;
        return rest;
      }),
    })),
  };
}

export function makeDoctorCommand(): Command {
  return new Command('doctor')
    .description('Validate all Foreman artifacts — config, specs, archives, changes, graphs, templates')
    .argument('[change]', 'Scope to a specific change (omit to check everything)')
    .option('--fix', 'Auto-repair fixable issues', false)
    .option('--category <name>', 'Only run checks for a specific category')
    .action(async (change: string | undefined, opts: { fix?: boolean; category?: string }, cmd: Command) => {
      const root = findForemanRoot();
      const jsonMode = (cmd.parent?.opts() as { json?: boolean })?.json ?? false;

      const report = runDoctor({
        root,
        category: opts.category,
      });

      let fixCount = 0;
      if (opts.fix && report.totalFixable > 0) {
        fixCount = await applyFixes(report);
      }

      if (jsonMode) {
        output(stripFix(report), { json: true, quiet: false });
      } else {
        const text = formatReport(report);
        process.stdout.write(text + '\n');
        if (fixCount > 0) {
          process.stdout.write(`\nApplied ${fixCount} fix(es).\n`);
        }
      }

      if (opts.fix) {
        // Re-run to check if fixes resolved all issues
        const recheck = runDoctor({ root, category: opts.category });
        if (recheck.totalFail > 0) {
          process.exit(1);
        }
      } else if (report.totalFail > 0) {
        process.exit(1);
      }
    });
}
