import chalk from 'chalk';

let verbose = false;

export function setVerbose(value: boolean): void {
  verbose = value;
}

export function info(msg: string): void {
  process.stderr.write(msg + '\n');
}

export function warn(msg: string): void {
  process.stderr.write(chalk.yellow(msg) + '\n');
}

export function error(msg: string): void {
  process.stderr.write(chalk.red(msg) + '\n');
}

export function debug(msg: string): void {
  if (verbose) {
    process.stderr.write(chalk.gray(`[debug] ${msg}`) + '\n');
  }
}

export function success(msg: string): void {
  process.stderr.write(chalk.green(msg) + '\n');
}
