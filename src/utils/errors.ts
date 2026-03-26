import { ExitCode } from '../types/index.js';

export class ForemanError extends Error {
  constructor(
    message: string,
    public readonly exitCode: ExitCode = ExitCode.ERROR
  ) {
    super(message);
    this.name = 'ForemanError';
  }
}

export class NodeNotFoundError extends ForemanError {
  constructor(nodeId: string) {
    super(`Node not found: "${nodeId}"`, ExitCode.ERROR);
    this.name = 'NodeNotFoundError';
  }
}

export class ChangeNotFoundError extends ForemanError {
  constructor(change: string, available: string[] = []) {
    const hint = available.length > 0
      ? ` Available: ${available.join(', ')}`
      : '';
    super(`Change not found: "${change}".${hint}`, ExitCode.ERROR);
    this.name = 'ChangeNotFoundError';
  }
}

export class LockError extends ForemanError {
  constructor(change: string, pid: number) {
    super(
      `Workflow "${change}" is locked by process ${pid}. Another foreman process may be running.`,
      ExitCode.BLOCKED
    );
    this.name = 'LockError';
  }
}

export class ValidationError extends ForemanError {
  constructor(nodeId: string, check: string, detail?: string) {
    const msg = detail
      ? `Validation failed for node "${nodeId}" (${check}): ${detail}`
      : `Validation failed for node "${nodeId}" (${check})`;
    super(msg, ExitCode.ERROR);
    this.name = 'ValidationError';
  }
}

export class ScopeError extends ForemanError {
  constructor(filePath: string, allowedPaths: string[]) {
    super(
      `File "${filePath}" is outside scope. Allowed paths: ${allowedPaths.join(', ')}`,
      ExitCode.BLOCKED
    );
    this.name = 'ScopeError';
  }
}
