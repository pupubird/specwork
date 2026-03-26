import fs from 'node:fs';
import path from 'node:path';
import { ForemanError } from '../utils/errors.js';
import { ExitCode } from '../types/index.js';
import {
  changeDir,
  graphDir,
  nodesDir,
  archiveChangeDir,
  graphPath,
  statePath,
} from '../utils/paths.js';
import { readYaml, writeYaml } from '../io/filesystem.js';

export function archiveChange(root: string, change: string): void {
  const src = changeDir(root, change);
  if (!fs.existsSync(src)) {
    throw new ForemanError(
      `Change directory not found: "${change}". Cannot archive.`,
      ExitCode.ERROR
    );
  }

  const dest = archiveChangeDir(root, change);
  fs.mkdirSync(dest, { recursive: true });

  // 1. Copy change dir contents to archive
  fs.cpSync(src, dest, { recursive: true });

  // 2. Copy graph files (graph.yaml and state.yaml) to archive root
  const gp = graphPath(root, change);
  if (fs.existsSync(gp)) {
    fs.cpSync(gp, path.join(dest, 'graph.yaml'));
  }
  const sp = statePath(root, change);
  if (fs.existsSync(sp)) {
    fs.cpSync(sp, path.join(dest, 'state.yaml'));
  }

  // 3. Copy node artifacts to archive/<change>/nodes/
  const nd = nodesDir(root, change);
  if (fs.existsSync(nd)) {
    fs.cpSync(nd, path.join(dest, 'nodes'), { recursive: true });
  }

  // 4. Promote specs to .foreman/specs/ (source of truth)
  const specsDir = path.join(src, 'specs');
  if (fs.existsSync(specsDir)) {
    const specFiles = fs.readdirSync(specsDir).filter(f => !f.startsWith('.'));
    if (specFiles.length > 0) {
      const targetSpecsDir = path.join(root, '.foreman', 'specs');
      fs.mkdirSync(targetSpecsDir, { recursive: true });
      for (const file of specFiles) {
        fs.cpSync(path.join(specsDir, file), path.join(targetSpecsDir, file), { recursive: true });
      }
    }
  }

  // 5. Update .foreman.yaml status to 'archived' (in archive copy)
  const metaPath = path.join(dest, '.foreman.yaml');
  if (fs.existsSync(metaPath)) {
    const meta = readYaml<Record<string, unknown>>(metaPath);
    meta.status = 'archived';
    writeYaml(metaPath, meta);
  }

  // 6. Remove originals
  fs.rmSync(src, { recursive: true, force: true });

  const gd = graphDir(root, change);
  if (fs.existsSync(gd)) {
    fs.rmSync(gd, { recursive: true, force: true });
  }

  if (fs.existsSync(nd)) {
    fs.rmSync(nd, { recursive: true, force: true });
  }
}
