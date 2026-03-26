import fs from 'node:fs';
import path from 'node:path';
import { SpecworkError } from '../utils/errors.js';
import { ensureDir } from '../io/filesystem.js';
import type { MigrateResult } from '../types/common.js';

export function migrateOpenspec(root: string): MigrateResult {
  const openspecDir = path.join(root, 'openspec');

  if (!fs.existsSync(openspecDir)) {
    throw new SpecworkError(`openspec directory not found at ${openspecDir}`);
  }

  let specsMigrated = 0;
  let changesMigrated = 0;
  let filesTotal = 0;

  // Migrate openspec/specs/<name>/spec.md → .specwork/specs/<name>.md
  const specsDir = path.join(openspecDir, 'specs');
  if (fs.existsSync(specsDir)) {
    for (const entry of fs.readdirSync(specsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const specFile = path.join(specsDir, entry.name, 'spec.md');
      if (!fs.existsSync(specFile)) continue;
      const dest = path.join(root, '.specwork', 'specs', `${entry.name}.md`);
      ensureDir(path.dirname(dest));
      fs.copyFileSync(specFile, dest);
      specsMigrated++;
      filesTotal++;
    }
  }

  // Migrate openspec/changes/<name>/ → .specwork/changes/<name>/
  const changesDir = path.join(openspecDir, 'changes');
  if (fs.existsSync(changesDir)) {
    for (const entry of fs.readdirSync(changesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const changeName = entry.name;
      const changeDir = path.join(changesDir, changeName);

      // Copy proposal.md
      const proposalSrc = path.join(changeDir, 'proposal.md');
      if (fs.existsSync(proposalSrc)) {
        const proposalDest = path.join(root, '.specwork', 'changes', changeName, 'proposal.md');
        ensureDir(path.dirname(proposalDest));
        fs.copyFileSync(proposalSrc, proposalDest);
        filesTotal++;
      }

      // Copy specs/<specname>/spec.md → .specwork/changes/<name>/specs/<specname>.md
      const changeSpecsDir = path.join(changeDir, 'specs');
      if (fs.existsSync(changeSpecsDir)) {
        for (const specEntry of fs.readdirSync(changeSpecsDir, { withFileTypes: true })) {
          if (!specEntry.isDirectory()) continue;
          const specFile = path.join(changeSpecsDir, specEntry.name, 'spec.md');
          if (!fs.existsSync(specFile)) continue;
          const dest = path.join(root, '.specwork', 'changes', changeName, 'specs', `${specEntry.name}.md`);
          ensureDir(path.dirname(dest));
          fs.copyFileSync(specFile, dest);
          filesTotal++;
        }
      }

      changesMigrated++;
    }
  }

  fs.rmSync(openspecDir, { recursive: true, force: true });

  return {
    specsMigrated,
    changesMigrated,
    filesTotal,
    openspecRemoved: true,
  };
}
