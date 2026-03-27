export interface MigrationResult {
  changed: boolean;
  details?: string[];
}

export type MigrationFn = (
  root: string,
  config: Record<string, unknown>,
) => MigrationResult;

export interface MigrationEntry {
  version: string;
  description: string;
  migrate: MigrationFn;
}
