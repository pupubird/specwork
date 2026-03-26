/**
 * Tests for .claude/hooks/node-complete.sh
 *
 * The hook is a SubagentStop bash script that:
 *   - Reads JSON from stdin with agent_id field
 *   - Only acts when agent_id starts with "specwork-"
 *   - Reads .specwork/.current-node (format: "change/node-id")
 *   - Creates .specwork/nodes/{change}/{node}/ directory
 *   - Runs git diff HEAD~1 > L2.md (silent errors)
 *   - Appends verify.md to L2.md if it exists
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  writeFileSync,
  mkdtempSync,
  rmSync,
  mkdirSync,
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOOK_PATH = path.resolve(__dirname, '../../../.claude/hooks/node-complete.sh');

function runHook(
  json: object,
  cwd: string,
): { exitCode: number; stderr: string } {
  const result = spawnSync('bash', [HOOK_PATH], {
    input: JSON.stringify(json),
    cwd,
    encoding: 'utf-8',
  });
  return {
    exitCode: result.status ?? 1,
    stderr: result.stderr ?? '',
  };
}

function initGitRepo(dir: string): void {
  spawnSync('git', ['init'], { cwd: dir, encoding: 'utf-8' });
  spawnSync('git', ['config', 'user.email', 'test@specwork.test'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'Specwork Test'], { cwd: dir });
  writeFileSync(path.join(dir, 'README.md'), '# Test\n');
  spawnSync('git', ['add', '.'], { cwd: dir, encoding: 'utf-8' });
  spawnSync('git', ['commit', '-m', 'initial'], { cwd: dir, encoding: 'utf-8' });
  // Second commit so HEAD~1 exists
  writeFileSync(path.join(dir, 'change.md'), '# Change\n');
  spawnSync('git', ['add', '.'], { cwd: dir, encoding: 'utf-8' });
  spawnSync('git', ['commit', '-m', 'second'], { cwd: dir, encoding: 'utf-8' });
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'node-complete-test-'));
  mkdirSync(path.join(tmpDir, '.specwork'), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Non-specwork agents ────────────────────────────────────────────────────────

describe('node-complete.sh — non-specwork agents', () => {
  it('exits 0 without acting for a non-specwork agent', () => {
    writeFileSync(
      path.join(tmpDir, '.specwork', '.current-node'),
      'my-change/snapshot',
      'utf8',
    );
    const result = runHook({ agent_id: 'some-other-agent' }, tmpDir);
    expect(result.exitCode).toBe(0);
  });

  it('does not create node directory for a non-specwork agent', () => {
    writeFileSync(
      path.join(tmpDir, '.specwork', '.current-node'),
      'my-change/snapshot',
      'utf8',
    );
    runHook({ agent_id: 'some-other-agent' }, tmpDir);
    expect(existsSync(path.join(tmpDir, '.specwork', 'nodes', 'my-change', 'snapshot'))).toBe(false);
  });

  it('exits 0 without acting when agent_id is empty string', () => {
    const result = runHook({ agent_id: '' }, tmpDir);
    expect(result.exitCode).toBe(0);
  });

  it('exits 0 without acting when agent_id is absent', () => {
    const result = runHook({}, tmpDir);
    expect(result.exitCode).toBe(0);
  });
});

// ── Specwork agents — no .current-node file ────────────────────────────────────

describe('node-complete.sh — specwork agent, no .current-node', () => {
  it('exits 0 gracefully when .current-node file is missing', () => {
    // No .current-node file written
    const result = runHook({ agent_id: 'specwork-implementer' }, tmpDir);
    expect(result.exitCode).toBe(0);
  });

  it('does not create any node directories when .current-node is missing', () => {
    runHook({ agent_id: 'specwork-test-writer' }, tmpDir);
    const nodesDir = path.join(tmpDir, '.specwork', 'nodes');
    // Should not exist or be empty
    if (existsSync(nodesDir)) {
      const entries = readdirSync(nodesDir);
      expect(entries).toHaveLength(0);
    } else {
      expect(existsSync(nodesDir)).toBe(false);
    }
  });
});

// ── Specwork agents — with .current-node file ──────────────────────────────────

describe('node-complete.sh — specwork agent, with .current-node', () => {
  beforeEach(() => {
    initGitRepo(tmpDir);
    writeFileSync(
      path.join(tmpDir, '.specwork', '.current-node'),
      'my-change/snapshot',
      'utf8',
    );
  });

  it('exits 0 after processing a specwork agent', () => {
    const result = runHook({ agent_id: 'specwork-implementer' }, tmpDir);
    expect(result.exitCode).toBe(0);
  });

  it('creates the node directory at .specwork/nodes/{change}/{node}/', () => {
    runHook({ agent_id: 'specwork-implementer' }, tmpDir);
    const nodeDir = path.join(tmpDir, '.specwork', 'nodes', 'my-change', 'snapshot');
    expect(existsSync(nodeDir)).toBe(true);
  });

  it('creates L2.md inside the node directory', () => {
    runHook({ agent_id: 'specwork-implementer' }, tmpDir);
    const l2Path = path.join(tmpDir, '.specwork', 'nodes', 'my-change', 'snapshot', 'L2.md');
    expect(existsSync(l2Path)).toBe(true);
  });

  it('L2.md contains git diff content (second commit exists)', () => {
    runHook({ agent_id: 'specwork-implementer' }, tmpDir);
    const l2Path = path.join(tmpDir, '.specwork', 'nodes', 'my-change', 'snapshot', 'L2.md');
    const content = readFileSync(l2Path, 'utf8');
    // git diff HEAD~1 should show the diff of the second commit (change.md added)
    expect(content).toContain('change.md');
  });

  it('emits a progress message to stderr', () => {
    const result = runHook({ agent_id: 'specwork-implementer' }, tmpDir);
    expect(result.stderr).toContain('snapshot');
  });

  it('works for all specwork-* agent variants', () => {
    const agents = ['specwork-test-writer', 'specwork-verifier', 'specwork-summarizer'];
    for (const agentId of agents) {
      // Reset .current-node for each agent variant test
      writeFileSync(
        path.join(tmpDir, '.specwork', '.current-node'),
        `my-change/${agentId.replace('specwork-', '')}`,
        'utf8',
      );
      const result = runHook({ agent_id: agentId }, tmpDir);
      expect(result.exitCode).toBe(0);
    }
  });
});

// ── verify.md appended to L2.md ───────────────────────────────────────────────

describe('node-complete.sh — verify.md integration', () => {
  beforeEach(() => {
    initGitRepo(tmpDir);
    writeFileSync(
      path.join(tmpDir, '.specwork', '.current-node'),
      'qa-change/write-tests',
      'utf8',
    );
  });

  it('appends verify.md content to L2.md when it exists', () => {
    // Pre-create the node directory with a verify.md
    const nodeDir = path.join(tmpDir, '.specwork', 'nodes', 'qa-change', 'write-tests');
    mkdirSync(nodeDir, { recursive: true });
    writeFileSync(path.join(nodeDir, 'verify.md'), 'PASS: all checks passed\n', 'utf8');

    runHook({ agent_id: 'specwork-verifier' }, tmpDir);

    const l2Content = readFileSync(path.join(nodeDir, 'L2.md'), 'utf8');
    expect(l2Content).toContain('---');
    expect(l2Content).toContain('PASS: all checks passed');
  });

  it('L2.md does not contain separator when verify.md is absent', () => {
    runHook({ agent_id: 'specwork-verifier' }, tmpDir);

    const nodeDir = path.join(tmpDir, '.specwork', 'nodes', 'qa-change', 'write-tests');
    const l2Content = readFileSync(path.join(nodeDir, 'L2.md'), 'utf8');
    expect(l2Content).not.toContain('---');
  });
});

// ── Parsing change/node from .current-node ────────────────────────────────────

describe('node-complete.sh — .current-node parsing', () => {
  beforeEach(() => {
    initGitRepo(tmpDir);
  });

  it('correctly parses change and node from "change/node-id" format', () => {
    writeFileSync(
      path.join(tmpDir, '.specwork', '.current-node'),
      'alpha-change/impl-core',
      'utf8',
    );
    runHook({ agent_id: 'specwork-implementer' }, tmpDir);

    expect(existsSync(
      path.join(tmpDir, '.specwork', 'nodes', 'alpha-change', 'impl-core')
    )).toBe(true);
  });

  it('handles hyphenated change name correctly', () => {
    writeFileSync(
      path.join(tmpDir, '.specwork', '.current-node'),
      'my-feature-change/write-tests',
      'utf8',
    );
    runHook({ agent_id: 'specwork-test-writer' }, tmpDir);

    expect(existsSync(
      path.join(tmpDir, '.specwork', 'nodes', 'my-feature-change', 'write-tests')
    )).toBe(true);
  });
});
