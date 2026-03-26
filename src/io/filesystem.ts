import fs from 'node:fs';
import path from 'node:path';
import { parseYaml, stringifyYaml } from './yaml.js';
import { SpecworkError } from '../utils/errors.js';
import { ExitCode } from '../types/index.js';

export function readYaml<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    throw new SpecworkError(`File not found: ${filePath}`, ExitCode.ERROR);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return parseYaml<T>(content, filePath);
}

export function writeYaml(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, stringifyYaml(data), 'utf8');
}

export function readMarkdown(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

export function writeMarkdown(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function exists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function remove(filePath: string): void {
  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filePath);
    }
  }
}
