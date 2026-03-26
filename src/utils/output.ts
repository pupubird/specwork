import type { OutputOptions } from '../types/index.js';

export function output(data: unknown, options: OutputOptions): void {
  if (options.quiet) return;
  if (options.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } else {
    if (typeof data === 'string') {
      process.stdout.write(data + '\n');
    } else {
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    }
  }
}

export function table(headers: string[], rows: string[][]): void {
  if (headers.length === 0) return;

  // Compute column widths
  const widths = headers.map((h, i) => {
    const colMax = rows.reduce((max, row) => {
      const cell = row[i] ?? '';
      return Math.max(max, cell.length);
    }, 0);
    return Math.max(h.length, colMax);
  });

  const separator = widths.map(w => '-'.repeat(w + 2)).join('+');
  const formatRow = (cells: string[]) =>
    widths.map((w, i) => ` ${(cells[i] ?? '').padEnd(w)} `).join('|');

  process.stdout.write(separator + '\n');
  process.stdout.write(formatRow(headers) + '\n');
  process.stdout.write(separator + '\n');
  for (const row of rows) {
    process.stdout.write(formatRow(row) + '\n');
  }
  process.stdout.write(separator + '\n');
}
