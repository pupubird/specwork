export enum ExitCode {
  SUCCESS = 0,
  ERROR = 1,
  BLOCKED = 2,
}

export interface ChangeRef {
  name: string;
  graphDir: string;
  nodesDir: string;
  changeDir: string;
}

export interface OutputOptions {
  json: boolean;
  quiet: boolean;
}

export interface MigrateResult {
  specsMigrated: number;
  changesMigrated: number;
  filesTotal: number;
  openspecRemoved: boolean;
}

export interface FileClassification {
  path: string;
  status: 'new' | 'unmodified' | 'modified';
}

export interface UpdateResult {
  previousVersion: string | null;
  newVersion: string;
  filesUpdated: number;
  filesBackedUp: number;
  configFieldsAdded: string[];
  deprecated: string[];
  backupPath: string | null;
  dryRun: boolean;
}
