import { ExitCode } from '../types/index.js';

export class SpecworkError extends Error {
  constructor(
    message: string,
    public readonly exitCode: ExitCode = ExitCode.ERROR
  ) {
    super(message);
    this.name = 'SpecworkError';
  }
}

export class NodeNotFoundError extends SpecworkError {
  constructor(nodeId: string) {
    super(`Node not found: "${nodeId}"`, ExitCode.ERROR);
    this.name = 'NodeNotFoundError';
  }
}

export class ChangeNotFoundError extends SpecworkError {
  constructor(change: string, available: string[] = []) {
    const hint = available.length > 0
      ? ` Available: ${available.join(', ')}`
      : '';
    super(`Change not found: "${change}".${hint}`, ExitCode.ERROR);
    this.name = 'ChangeNotFoundError';
  }
}

export class LockError extends SpecworkError {
  constructor(change: string, pid: number) {
    super(
      `Workflow "${change}" is locked by process ${pid}. Another specwork process may be running.`,
      ExitCode.BLOCKED
    );
    this.name = 'LockError';
  }
}

export class ValidationError extends SpecworkError {
  constructor(nodeId: string, check: string, detail?: string) {
    const msg = detail
      ? `Validation failed for node "${nodeId}" (${check}): ${detail}`
      : `Validation failed for node "${nodeId}" (${check})`;
    super(msg, ExitCode.ERROR);
    this.name = 'ValidationError';
  }
}

export class ScopeError extends SpecworkError {
  constructor(filePath: string, allowedPaths: string[]) {
    super(
      `File "${filePath}" is outside scope. Allowed paths: ${allowedPaths.join(', ')}`,
      ExitCode.BLOCKED
    );
    this.name = 'ScopeError';
  }
}
