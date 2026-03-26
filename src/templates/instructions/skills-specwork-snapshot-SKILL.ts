export const SKILLS_SPECWORK_SNAPSHOT_SKILL = `---
name: specwork-snapshot
description: >
  Generates environment snapshots for Specwork workflows.
  Creates .specwork/env/snapshot.md with project structure, dependencies, exports, and config.
---

# Specwork Snapshot Generation

Generate an environment snapshot at \`.specwork/env/snapshot.md\`.

## What to include

### File Tree
List all source files (src/, lib/, app/) excluding node_modules, dist, .git.
Use: \`find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' | sort\`

### Dependencies
Extract from package.json: dependencies and devDependencies sections.

### Exported Symbols
Grep for export statements in TypeScript/JavaScript files:
\`grep -rn "^export" --include="*.ts" --include="*.tsx" --include="*.js" src/\`

### Config Files
List configuration files: tsconfig.json, package.json, .eslintrc*, vite.config.*, etc.

### Key Conventions
Extract rules from CLAUDE.md if it exists.

## Output Format

Write to \`.specwork/env/snapshot.md\` with these sections:

\`\`\`markdown
# Environment Snapshot
Generated: <timestamp>

## File Tree
<file listing>

## Dependencies
<from package.json>

## Exported Symbols
<export statements with file:line>

## Config Files
<list of config files>

## Conventions
<from CLAUDE.md>
\`\`\`

## When to run
- Before starting a Specwork workflow (first node is usually snapshot)
- After each completed node (if config.snapshot_refresh = after_each_node)
- Manually via \`specwork snapshot\` CLI or \`/project:specwork-snapshot\`
`;
