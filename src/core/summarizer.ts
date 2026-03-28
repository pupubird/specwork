import fs from 'node:fs';
import path from 'node:path';
import { StructuredL1 } from '../types/context.js';
import { nodeDir } from '../utils/paths.js';

export function writeStructuredL1(root: string, change: string, nodeId: string, data: StructuredL1): void {
  const dir = nodeDir(root, change, nodeId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'L1-structured.json'), JSON.stringify(data, null, 2));
}
