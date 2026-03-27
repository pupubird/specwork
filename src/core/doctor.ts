import fs from 'node:fs';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseYaml } from '../io/yaml.js';
import { validateGraph } from './graph-validator.js';
import type { Graph } from '../types/graph.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DiagnosticResult {
  category: string;
  label: string;
  pass: boolean;
  fixable: boolean;
  fix?: () => Promise<void>;
  detail?: string;
}

export interface CheckResult {
  category: string;
  results: DiagnosticResult[];
}

export interface DoctorReport {
  checks: CheckResult[];
  totalPass: number;
  totalFail: number;
  totalFixable: number;
}

export interface DoctorOptions {
  root: string;
  fix?: boolean;
  category?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pass(category: string, label: string): DiagnosticResult {
  return { category, label, pass: true, fixable: false };
}

function fail(category: string, label: string, detail?: string, fixable = false, fix?: () => Promise<void>): DiagnosticResult {
  return { category, label, pass: false, fixable, fix, detail };
}

function readYamlSafe<T>(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseYaml<T>(content, filePath);
  } catch {
    return null;
  }
}

// ── checkConfig ──────────────────────────────────────────────────────────────

export function checkConfig(root: string): CheckResult {
  const category = 'Config';
  const results: DiagnosticResult[] = [];
  const configPath = path.join(root, '.specwork', 'config.yaml');

  if (!fs.existsSync(configPath)) {
    results.push(fail(category, 'config.yaml exists', 'Missing .specwork/config.yaml'));
    return { category, results };
  }
  results.push(pass(category, 'config.yaml exists'));

  const config = readYamlSafe<Record<string, unknown>>(configPath);
  if (!config) {
    results.push(fail(category, 'config.yaml is valid YAML', 'Failed to parse config.yaml'));
    return { category, results };
  }

  const requiredSections = ['models', 'execution', 'spec', 'graph'];
  for (const section of requiredSections) {
    if (config[section] && typeof config[section] === 'object') {
      results.push(pass(category, `${section} section present`));
    } else {
      results.push(fail(category, `${section} section present`, `Missing required section: ${section}`));
    }
  }

  return { category, results };
}

// ── checkSpecs ───────────────────────────────────────────────────────────────

export function checkSpecs(root: string): CheckResult {
  const category = 'Specs';
  const results: DiagnosticResult[] = [];

  const specsDirs = [path.join(root, '.specwork', 'specs')];

  // Also check change-level specs
  const changesDir = path.join(root, '.specwork', 'changes');
  if (fs.existsSync(changesDir)) {
    const changeDirs = fs.readdirSync(changesDir).filter(d => {
      const fullPath = path.join(changesDir, d);
      return d !== 'archive' && fs.statSync(fullPath).isDirectory();
    });
    for (const change of changeDirs) {
      const changeSpecsDir = path.join(changesDir, change, 'specs');
      if (fs.existsSync(changeSpecsDir)) {
        specsDirs.push(changeSpecsDir);
      }
    }
  }

  const specFiles: string[] = [];
  for (const dir of specsDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && !f.startsWith('.'));
    for (const file of files) {
      specFiles.push(path.join(dir, file));
    }
  }

  if (specFiles.length === 0) {
    return { category, results };
  }

  for (const filePath of specFiles) {
    const fileName = path.basename(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    let hasRequirement = false;
    let hasScenario = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for ### Requirement: headers
      if (/^### Requirement:/.test(line)) {
        hasRequirement = true;
      }

      // Check for wrong heading level on scenarios: ### Scenario instead of ####
      if (/^### Scenario:/.test(line)) {
        const fixFn = async () => {
          const fileContent = fs.readFileSync(filePath, 'utf-8');
          const fixed = fileContent.replace(/^### Scenario:/gm, '#### Scenario:');
          fs.writeFileSync(filePath, fixed, 'utf-8');
        };
        results.push(fail(
          category,
          `${fileName}: scenario heading level`,
          `Line ${lineNum}: "### Scenario:" should be "#### Scenario:" (4#)`,
          true,
          fixFn
        ));
      }

      // Check for valid #### Scenario: headers
      if (/^#### Scenario:/.test(line)) {
        hasScenario = true;
      }
    }

    // Check scenarios have GIVEN/WHEN/THEN
    if (hasScenario || /^### Scenario:/.test(content)) {
      const scenarioBlocks = content.split(/^#{3,4} Scenario:/m).slice(1);
      for (const block of scenarioBlocks) {
        const blockLines = block.split('\n').map(l => l.trim()).filter(Boolean);
        const hasGWT = blockLines.some(l => /\*{0,2}GIVEN\*{0,2}/i.test(l)) &&
                       blockLines.some(l => /\*{0,2}WHEN\*{0,2}/i.test(l)) &&
                       blockLines.some(l => /\*{0,2}THEN\*{0,2}/i.test(l));
        if (!hasGWT) {
          results.push(fail(category, `${fileName}: GIVEN/WHEN/THEN structure`, `Scenario missing GIVEN/WHEN/THEN`));
        }
      }
    }

    // Check for SHALL/SHOULD/MAY keywords if requirements exist
    if (hasRequirement) {
      const hasKeywords = /\b(SHALL|MUST|SHOULD|MAY)\b/.test(content);
      if (hasKeywords) {
        results.push(pass(category, `${fileName}: keywords present`));
      }
    }
  }

  return { category, results };
}

// ── checkArchives ────────────────────────────────────────────────────────────

export function checkArchives(root: string): CheckResult {
  const category = 'Archives';
  const results: DiagnosticResult[] = [];
  const archiveDir = path.join(root, '.specwork', 'changes', 'archive');

  if (!fs.existsSync(archiveDir)) {
    return { category, results };
  }

  const archives = fs.readdirSync(archiveDir).filter(d => {
    const fullPath = path.join(archiveDir, d);
    return fs.statSync(fullPath).isDirectory() && !d.startsWith('.');
  });

  if (archives.length === 0) {
    return { category, results };
  }

  for (const name of archives) {
    const dir = path.join(archiveDir, name);

    // Check .specwork.yaml exists and has correct status
    const metaPath = path.join(dir, '.specwork.yaml');
    if (!fs.existsSync(metaPath)) {
      results.push(fail(category, `${name}: .specwork.yaml exists`, `Missing .specwork.yaml in archive ${name}`));
    } else {
      const meta = readYamlSafe<Record<string, unknown>>(metaPath);
      if (meta && meta.status === 'archived') {
        results.push(pass(category, `${name}: status is archived`));
      } else {
        results.push(fail(category, `${name}: status is archived`, `Expected status "archived", got "${meta?.status}"`));
      }
    }

    // Check required files
    const requiredFiles = ['proposal.md', 'design.md', 'tasks.md', 'digest.md'];
    for (const file of requiredFiles) {
      if (fs.existsSync(path.join(dir, file))) {
        results.push(pass(category, `${name}: ${file} exists`));
      } else {
        results.push(fail(category, `${name}: ${file} exists`, `Missing ${file} in archive ${name}`));
      }
    }

    // Check all tasks are checked off
    const tasksFilePath = path.join(dir, 'tasks.md');
    if (fs.existsSync(tasksFilePath)) {
      const tasksContent = fs.readFileSync(tasksFilePath, 'utf-8');
      const unchecked = tasksContent.split('\n').filter(l => /^- \[ \]/.test(l));
      if (unchecked.length > 0) {
        results.push(fail(
          category,
          `${name}: all tasks checked off`,
          `${unchecked.length} unchecked task(s) in archived tasks.md`,
          true,
          async () => {
            const content = fs.readFileSync(tasksFilePath, 'utf-8');
            fs.writeFileSync(tasksFilePath, content.replace(/^- \[ \]/gm, '- [x]'), 'utf-8');
          }
        ));
      } else {
        results.push(pass(category, `${name}: all tasks checked off`));
      }
    }

    // Check for loose artifacts (should be consolidated)
    const looseFiles = ['graph.yaml', 'state.yaml'];
    for (const file of looseFiles) {
      if (fs.existsSync(path.join(dir, file))) {
        const filePath = path.join(dir, file);
        results.push(fail(
          category,
          `${name}: no loose ${file}`,
          `Archive has loose ${file} (should be in digest.md)`,
          true,
          async () => { fs.unlinkSync(filePath); }
        ));
      }
    }

    // Check for loose nodes/ directory
    const nodesPath = path.join(dir, 'nodes');
    if (fs.existsSync(nodesPath) && fs.statSync(nodesPath).isDirectory()) {
      results.push(fail(
        category,
        `${name}: no loose nodes/`,
        `Archive has loose nodes/ directory (should be in digest.md)`,
        true,
        async () => { fs.rmSync(nodesPath, { recursive: true, force: true }); }
      ));
    }
  }

  return { category, results };
}

// ── checkChanges ─────────────────────────────────────────────────────────────

export function checkChanges(root: string): CheckResult {
  const category = 'Changes';
  const results: DiagnosticResult[] = [];
  const changesDir = path.join(root, '.specwork', 'changes');

  if (!fs.existsSync(changesDir)) {
    return { category, results };
  }

  const changes = fs.readdirSync(changesDir).filter(d => {
    const fullPath = path.join(changesDir, d);
    return d !== 'archive' && fs.statSync(fullPath).isDirectory() && !d.startsWith('.');
  });

  if (changes.length === 0) {
    return { category, results };
  }

  for (const name of changes) {
    const dir = path.join(changesDir, name);

    // Check required files
    const requiredFiles = ['proposal.md', 'design.md', 'tasks.md'];
    for (const file of requiredFiles) {
      if (fs.existsSync(path.join(dir, file))) {
        results.push(pass(category, `${name}: ${file} exists`));
      } else {
        results.push(fail(category, `${name}: ${file} exists`, `Missing ${file} in change ${name}`));
      }
    }

    // Check tasks.md uses checkbox format
    const tasksPath = path.join(dir, 'tasks.md');
    if (fs.existsSync(tasksPath)) {
      const tasksContent = fs.readFileSync(tasksPath, 'utf-8');
      const contentLines = tasksContent.split('\n').filter(l => l.trim().length > 0);
      // Lines that look like task items (bullets or numbered)
      const taskLines = contentLines.filter(l => /^\s*[-*]\s/.test(l) || /^\s*\d+[.)]\s/.test(l));
      if (taskLines.length > 0) {
        const checkboxLines = taskLines.filter(l => /^\s*- \[[ x]\]/.test(l));
        if (checkboxLines.length === 0) {
          results.push(fail(category, `${name}: tasks use checkbox format`, `tasks.md does not use - [ ] checkbox format`));
        } else {
          results.push(pass(category, `${name}: tasks use checkbox format`));
        }
      }
    }
  }

  return { category, results };
}

// ── checkGraphs ──────────────────────────────────────────────────────────────

export function checkGraphs(root: string): CheckResult {
  const category = 'Graphs';
  const results: DiagnosticResult[] = [];
  const graphsDir = path.join(root, '.specwork', 'graph');

  if (!fs.existsSync(graphsDir)) {
    return { category, results };
  }

  const graphDirs = fs.readdirSync(graphsDir).filter(d => {
    const fullPath = path.join(graphsDir, d);
    return fs.statSync(fullPath).isDirectory() && !d.startsWith('.');
  });

  if (graphDirs.length === 0) {
    return { category, results };
  }

  for (const change of graphDirs) {
    const graphPath = path.join(graphsDir, change, 'graph.yaml');
    if (!fs.existsSync(graphPath)) {
      results.push(fail(category, `${change}: graph.yaml exists`, `Missing graph.yaml for change ${change}`));
      continue;
    }

    const graph = readYamlSafe<Graph>(graphPath);
    if (!graph) {
      results.push(fail(category, `${change}: graph.yaml is valid YAML`, `Failed to parse graph.yaml`));
      continue;
    }

    results.push(pass(category, `${change}: graph.yaml is valid`));

    // Delegate to existing graph-validator
    const validation = validateGraph(graph);
    for (const error of validation.errors) {
      results.push(fail(category, `${change}: ${error}`));
    }
    for (const warning of validation.warnings) {
      results.push(pass(category, `${change}: ${warning}`));
    }
  }

  return { category, results };
}

// ── checkTemplates ───────────────────────────────────────────────────────────

const DEFAULT_TEMPLATES: Record<string, string> = {
  'proposal.md': '# Proposal\n',
  'design.md': '# Design\n',
  'tasks.md': '## 1. Default\n\n- [ ] 1.1 Placeholder\n',
};

export function checkTemplates(root: string): CheckResult {
  const category = 'Templates';
  const results: DiagnosticResult[] = [];
  const templatesDir = path.join(root, '.specwork', 'templates');

  if (!fs.existsSync(templatesDir)) {
    for (const name of Object.keys(DEFAULT_TEMPLATES)) {
      results.push(fail(category, `${name} exists`, `Templates directory missing`, true, async () => {
        fs.mkdirSync(templatesDir, { recursive: true });
        fs.writeFileSync(path.join(templatesDir, name), DEFAULT_TEMPLATES[name], 'utf-8');
      }));
    }
    return { category, results };
  }

  for (const [name, defaultContent] of Object.entries(DEFAULT_TEMPLATES)) {
    const filePath = path.join(templatesDir, name);
    if (fs.existsSync(filePath)) {
      results.push(pass(category, `${name} exists`));
    } else {
      results.push(fail(category, `${name} exists`, `Missing template: ${name}`, true, async () => {
        fs.writeFileSync(filePath, defaultContent, 'utf-8');
      }));
    }
  }

  return { category, results };
}

// ── checkCrossRefs ───────────────────────────────────────────────────────────

export function checkCrossRefs(root: string): CheckResult {
  const category = 'CrossRefs';
  const results: DiagnosticResult[] = [];
  const graphsDir = path.join(root, '.specwork', 'graph');
  const nodesBaseDir = path.join(root, '.specwork', 'nodes');
  const changesDir = path.join(root, '.specwork', 'changes');

  if (!fs.existsSync(graphsDir)) {
    return { category, results };
  }

  const graphDirs = fs.readdirSync(graphsDir).filter(d => {
    const fullPath = path.join(graphsDir, d);
    return fs.statSync(fullPath).isDirectory() && !d.startsWith('.');
  });

  for (const change of graphDirs) {
    const graphPath = path.join(graphsDir, change, 'graph.yaml');
    if (!fs.existsSync(graphPath)) continue;

    const graph = readYamlSafe<Graph>(graphPath);
    if (!graph) continue;

    const graphNodeIds = new Set(graph.nodes.map(n => n.id));

    // Check for orphaned node directories (node dirs not in graph)
    const changeNodesDir = path.join(nodesBaseDir, change);
    if (fs.existsSync(changeNodesDir)) {
      const nodeDirs = fs.readdirSync(changeNodesDir).filter(d => {
        return fs.statSync(path.join(changeNodesDir, d)).isDirectory();
      });

      for (const nodeId of nodeDirs) {
        if (!graphNodeIds.has(nodeId)) {
          results.push(fail(category, `${change}/${nodeId}: in graph`, `Orphaned node directory: ${nodeId} not found in graph`));
        } else {
          results.push(pass(category, `${change}/${nodeId}: in graph`));
        }
      }
    }

    // Check graph has corresponding change or archive directory
    const changeExistsDir = path.join(changesDir, change);
    const archiveExistsDir = path.join(changesDir, 'archive', change);
    const nodesExist = fs.existsSync(changeNodesDir);
    if (!nodesExist && !fs.existsSync(changeExistsDir) && !fs.existsSync(archiveExistsDir)) {
      results.push(fail(category, `${change}: change directory exists`, `Graph references change "${change}" but no change or node directories found`));
    }
  }

  return { category, results };
}

// ── checkVersion ─────────────────────────────────────────────────────────

export function checkVersion(root: string): CheckResult {
  const category = 'Version';
  const results: DiagnosticResult[] = [];

  const __fn = fileURLToPath(import.meta.url);
  const __dn = dirname(__fn);
  let installedVersion = '0.0.0';
  for (const rel of [join(__dn, '..', 'package.json'), join(__dn, '..', '..', 'package.json')]) {
    if (fs.existsSync(rel)) {
      installedVersion = (JSON.parse(readFileSync(rel, 'utf8')) as { version: string }).version;
      break;
    }
  }

  const configPath = path.join(root, '.specwork', 'config.yaml');
  if (!fs.existsSync(configPath)) {
    results.push(fail(category, 'specwork version is current', 'No config.yaml found', true));
    return { category, results };
  }

  const config = readYamlSafe<Record<string, unknown>>(configPath);
  if (!config) {
    results.push(fail(category, 'specwork version is current', 'Failed to parse config.yaml', false));
    return { category, results };
  }

  const projectVersion = config.specwork_version as string | undefined;
  if (!projectVersion) {
    // Check if this is a modern project (has manifest) or legacy
    const manifestExists = fs.existsSync(path.join(root, '.specwork', 'manifest.yaml'));
    if (manifestExists) {
      // Modern project with manifest but missing version — likely deleted
      results.push(fail(
        category,
        'specwork version is current',
        `No specwork_version found — run \`specwork update\``,
        true,
      ));
    } else {
      // Legacy project without version tracking — not a failure
      results.push(pass(category, 'specwork version tracking not yet enabled'));
    }
    return { category, results };
  }

  if (projectVersion === installedVersion) {
    results.push(pass(category, 'specwork version is current'));
  } else {
    results.push(fail(
      category,
      'specwork version is current',
      `Project version ${projectVersion}, installed ${installedVersion} — run \`specwork update\``,
      true,
    ));
  }

  return { category, results };
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

export function runDoctor(options: DoctorOptions): DoctorReport {
  const { root, category } = options;

  const allCheckers: Array<[string, () => CheckResult]> = [
    ['Version', () => checkVersion(root)],
    ['Config', () => checkConfig(root)],
    ['Specs', () => checkSpecs(root)],
    ['Archives', () => checkArchives(root)],
    ['Changes', () => checkChanges(root)],
    ['Graphs', () => checkGraphs(root)],
    ['Templates', () => checkTemplates(root)],
    ['CrossRefs', () => checkCrossRefs(root)],
  ];

  const categoryLower = category?.toLowerCase();
  const checkers = categoryLower
    ? allCheckers.filter(([name]) => name.toLowerCase() === categoryLower)
    : allCheckers;

  const checks = checkers.map(([, fn]) => fn());

  let totalPass = 0;
  let totalFail = 0;
  let totalFixable = 0;

  for (const check of checks) {
    for (const result of check.results) {
      if (result.pass) {
        totalPass++;
      } else {
        totalFail++;
        if (result.fixable) {
          totalFixable++;
        }
      }
    }
  }

  return { checks, totalPass, totalFail, totalFixable };
}

export async function applyFixes(report: DoctorReport): Promise<number> {
  let fixCount = 0;
  for (const check of report.checks) {
    for (const result of check.results) {
      if (!result.pass && result.fixable && result.fix) {
        await result.fix();
        fixCount++;
      }
    }
  }
  return fixCount;
}
