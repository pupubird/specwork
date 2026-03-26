/**
 * Embedded .claude/ and .foreman/ template files for `foreman init`.
 * These are written during initialization to provide batteries-included setup.
 * Each template is in its own file under ./instructions/ for maintainability.
 */

import { AGENTS_FOREMAN_IMPLEMENTER } from "./instructions/agents-foreman-implementer.js";
import { AGENTS_FOREMAN_PLANNER } from "./instructions/agents-foreman-planner.js";
import { AGENTS_FOREMAN_QA } from "./instructions/agents-foreman-qa.js";
import { AGENTS_FOREMAN_SUMMARIZER } from "./instructions/agents-foreman-summarizer.js";
import { AGENTS_FOREMAN_TEST_WRITER } from "./instructions/agents-foreman-test-writer.js";
import { AGENTS_FOREMAN_VERIFIER } from "./instructions/agents-foreman-verifier.js";
import { SKILLS_FOREMAN_CONTEXT_SKILL } from "./instructions/skills-foreman-context-SKILL.js";
import { SKILLS_FOREMAN_CONVENTIONS_SKILL } from "./instructions/skills-foreman-conventions-SKILL.js";
import { SKILLS_FOREMAN_ENGINE_SKILL } from "./instructions/skills-foreman-engine-SKILL.js";
import { SKILLS_FOREMAN_SNAPSHOT_SKILL } from "./instructions/skills-foreman-snapshot-SKILL.js";
import { COMMANDS_FOREMAN_GO } from "./instructions/commands-foreman-go.js";
import { COMMANDS_FOREMAN_PLAN } from "./instructions/commands-foreman-plan.js";
import { COMMANDS_FOREMAN_STATUS } from "./instructions/commands-foreman-status.js";
import { HOOKS_NODE_COMPLETE_SH } from "./instructions/hooks-node-complete-sh.js";
import { HOOKS_SCOPE_GUARD_SH } from "./instructions/hooks-scope-guard-sh.js";
import { HOOKS_SESSION_INIT_SH } from "./instructions/hooks-session-init-sh.js";
import { HOOKS_TYPE_CHECK_SH } from "./instructions/hooks-type-check-sh.js";

// Map of relative path → file content
// Paths are relative to the project root
export const CLAUDE_FILES: Record<string, string> = {
  ".claude/agents/foreman-implementer.md": AGENTS_FOREMAN_IMPLEMENTER,
  ".claude/agents/foreman-planner.md": AGENTS_FOREMAN_PLANNER,
  ".claude/agents/foreman-qa.md": AGENTS_FOREMAN_QA,
  ".claude/agents/foreman-summarizer.md": AGENTS_FOREMAN_SUMMARIZER,
  ".claude/agents/foreman-test-writer.md": AGENTS_FOREMAN_TEST_WRITER,
  ".claude/agents/foreman-verifier.md": AGENTS_FOREMAN_VERIFIER,
  ".claude/skills/foreman-context/SKILL.md": SKILLS_FOREMAN_CONTEXT_SKILL,
  ".claude/skills/foreman-conventions/SKILL.md":
    SKILLS_FOREMAN_CONVENTIONS_SKILL,
  ".claude/skills/foreman-engine/SKILL.md": SKILLS_FOREMAN_ENGINE_SKILL,
  ".claude/skills/foreman-snapshot/SKILL.md": SKILLS_FOREMAN_SNAPSHOT_SKILL,
  ".claude/commands/foreman-go.md": COMMANDS_FOREMAN_GO,
  ".claude/commands/foreman-plan.md": COMMANDS_FOREMAN_PLAN,
  ".claude/commands/foreman-status.md": COMMANDS_FOREMAN_STATUS,
  ".claude/hooks/node-complete.sh": HOOKS_NODE_COMPLETE_SH,
  ".claude/hooks/scope-guard.sh": HOOKS_SCOPE_GUARD_SH,
  ".claude/hooks/session-init.sh": HOOKS_SESSION_INIT_SH,
  ".claude/hooks/type-check.sh": HOOKS_TYPE_CHECK_SH,
};

// Settings.json as a structured object (written as JSON, not markdown)
export const CLAUDE_SETTINGS = {
  hooks: {
    SessionStart: [
      {
        matcher: "",
        hooks: [{ type: "command", command: ".claude/hooks/session-init.sh" }],
      },
    ],
    PreToolUse: [
      {
        matcher: "Write|Edit",
        hooks: [{ type: "command", command: ".claude/hooks/scope-guard.sh" }],
      },
    ],
    PostToolUse: [
      {
        matcher: "Write|Edit",
        hooks: [{ type: "command", command: ".claude/hooks/type-check.sh" }],
      },
    ],
    SubagentStop: [
      {
        matcher: "",
        hooks: [{ type: "command", command: ".claude/hooks/node-complete.sh" }],
      },
    ],
  },
  env: {
    CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
  },
};

// Schema.yaml content
export const SCHEMA_YAML: string = `name: spec-driven
version: 1
description: Default Foreman workflow - proposal → specs → design → tasks → graph

artifacts:
  - id: proposal
    generates: proposal.md
    description: Initial proposal document outlining the change
    template: proposal.md
    instruction: |
      Create the proposal document that establishes WHY this change is needed.

      Sections:
      - **Why**: 1-2 sentences on the problem or opportunity.
      - **What Changes**: Bullet list. Mark breaking changes with **BREAKING**.
      - **Capabilities**: Identify which specs will be created or modified:
        - **New Capabilities**: List capabilities being introduced. Each becomes \`.foreman/specs/<name>/spec.md\`. Use kebab-case.
        - **Modified Capabilities**: List existing capabilities whose REQUIREMENTS are changing. Each needs a delta spec file.
      - **Impact**: Affected files, directories, systems.

      Keep it concise (1-2 pages). Focus on "why" not "how".
    requires: []

  - id: specs
    generates: "specs/**/*.md"
    description: Delta specifications for the change
    template: spec.md
    instruction: |
      Create specification files defining WHAT the system should do.

      Create one spec file per capability in the proposal's Capabilities section:
      - New capabilities: \`.foreman/changes/<change>/specs/<capability>/spec.md\`
      - Modified capabilities: match existing folder name in \`.foreman/specs/<capability>/\`

      Delta operations:
      - **ADDED Requirements**: New capabilities
      - **MODIFIED Requirements**: Changed behavior — MUST include full updated content
      - **REMOVED Requirements**: Deprecated — MUST include **Reason** and **Migration**
      - **RENAMED Requirements**: Name changes — use FROM:/TO: format

      Format rules:
      - Requirements: \`### Requirement: <name>\` (3 hashtags)
      - Scenarios: \`#### Scenario: <name>\` (4 hashtags — CRITICAL, never 3)
      - Use SHALL/MUST for normative requirements
      - Every requirement needs at least one testable scenario
    requires:
      - proposal

  - id: design
    generates: design.md
    description: Technical design document
    template: design.md
    instruction: |
      Create the design document explaining HOW to implement the change.

      Only create if:
      - Cross-cutting change (multiple modules/services)
      - New external dependency or significant data model change
      - Security, performance, or migration complexity
      - Ambiguity that benefits from technical decisions before coding

      Sections: Context / Goals / Non-Goals / Decisions / Risks / Migration Plan / Open Questions
    requires:
      - proposal

  - id: tasks
    generates: tasks.md
    description: Implementation checklist
    template: tasks.md
    instruction: |
      Create the task list breaking down implementation work.

      - Group with \`## N.\` numbered headings
      - Every task: \`- [ ] N.M Task description\`
      - Order by dependency (blockers first)
      - Each task completable in one session

      These tasks become nodes in the Foreman execution graph.
    requires:
      - specs
      - design

apply:
  requires: [tasks]
  tracks: tasks.md
  instruction: |
    Run /project:foreman-graph <change> to generate the execution graph.
    Then run /project:foreman-run <change> to execute it.
`;

// Example graph content
export const EXAMPLE_GRAPH: string = `# Example Foreman graph: add-auth feature
# This graph implements JWT authentication for an API service.
# Generated by: /project:foreman-graph add-auth
# Run with: /project:foreman-run add-auth

change: add-auth
description: Add JWT-based authentication to the API

nodes:
  # ── Stage 0: Environment Snapshot ────────────────────────────────────────
  - id: snapshot
    type: deterministic
    description: Generate environment snapshot (file tree, deps, conventions)
    command: |
      echo "=== File Tree ===" > .foreman/nodes/add-auth/snapshot/output.txt
      find src -name "*.ts" | head -100 >> .foreman/nodes/add-auth/snapshot/output.txt
      echo "" >> .foreman/nodes/add-auth/snapshot/output.txt
      echo "=== Dependencies ===" >> .foreman/nodes/add-auth/snapshot/output.txt
      cat package.json >> .foreman/nodes/add-auth/snapshot/output.txt 2>/dev/null || echo "no package.json"
      echo "" >> .foreman/nodes/add-auth/snapshot/output.txt
      echo "=== Existing Interfaces ===" >> .foreman/nodes/add-auth/snapshot/output.txt
      grep -r "^export interface\\|^export type\\|^export function\\|^export class" src/ >> .foreman/nodes/add-auth/snapshot/output.txt 2>/dev/null
    deps: []
    outputs:
      - .foreman/nodes/add-auth/snapshot/output.txt

  # ── Stage 1: Write Tests (RED state) ─────────────────────────────────────
  - id: write-tests
    type: llm
    description: Write all tests before any implementation exists (RED state)
    agent: foreman-test-writer
    deps:
      - snapshot
    inputs:
      - .foreman/changes/add-auth/proposal.md
      - .foreman/changes/add-auth/design.md
    outputs:
      - src/__tests__/auth.unit.test.ts
      - src/__tests__/auth.integration.test.ts
      - src/__tests__/auth.acceptance.test.ts
    scope:
      - src/__tests__/
    validate:
      - tests-fail: src/__tests__/auth.unit.test.ts
      - tests-fail: src/__tests__/auth.integration.test.ts
      - file-exists: src/__tests__/auth.unit.test.ts
      - file-exists: src/__tests__/auth.integration.test.ts
    gate: human
    prompt: |
      Write comprehensive tests for the JWT authentication feature.
      Tests MUST all fail — no implementation exists yet.
      Cover: token generation, token validation, login endpoint, logout endpoint,
      protected route middleware, invalid credentials, expired tokens.

  # ── Stage 2: Implement Types ──────────────────────────────────────────────
  - id: impl-types
    type: llm
    description: Define TypeScript interfaces and types for auth system
    agent: foreman-implementer
    deps:
      - write-tests
    inputs: []
    outputs:
      - src/auth/types.ts
    scope:
      - src/auth/types.ts
    validate:
      - file-exists: src/auth/types.ts
      - tsc-check: ""
    prompt: |
      Define all TypeScript interfaces and types needed for the auth system.
      Look at the test files to understand the expected signatures.
      Create only src/auth/types.ts — no implementation logic.
      Required exports: JwtPayload, AuthConfig, LoginRequest, LoginResponse, AuthMiddleware type.

  # ── Stage 3: Implement JWT Utilities ─────────────────────────────────────
  - id: impl-jwt
    type: llm
    description: Implement JWT token generation and validation utilities
    agent: foreman-implementer
    deps:
      - impl-types
    inputs: []
    outputs:
      - src/auth/jwt.ts
    scope:
      - src/auth/jwt.ts
    validate:
      - tsc-check: ""
      - tests-pass: src/__tests__/auth.unit.test.ts
    prompt: |
      Implement JWT utility functions: generateToken(payload, secret, expiresIn),
      verifyToken(token, secret) → JwtPayload | null.
      Use only dependencies listed in the environment snapshot.
      Make the unit tests pass.

  # ── Stage 4: Implement Service Layer ─────────────────────────────────────
  - id: impl-service
    type: llm
    description: Implement AuthService with login/logout business logic
    agent: foreman-implementer
    deps:
      - impl-jwt
    inputs: []
    outputs:
      - src/auth/service.ts
    scope:
      - src/auth/service.ts
    validate:
      - tsc-check: ""
    prompt: |
      Implement AuthService class with: login(req: LoginRequest) → LoginResponse,
      logout(token: string) → void, validateSession(token: string) → JwtPayload | null.
      Use the jwt utilities from impl-jwt. Follow interfaces from impl-types.

  # ── Stage 5: Implement HTTP Handler ──────────────────────────────────────
  - id: impl-handler
    type: llm
    description: Implement HTTP route handlers and auth middleware
    agent: foreman-implementer
    deps:
      - impl-service
    inputs: []
    outputs:
      - src/auth/handler.ts
      - src/auth/middleware.ts
    scope:
      - src/auth/handler.ts
      - src/auth/middleware.ts
    validate:
      - tsc-check: ""
      - tests-pass: src/__tests__/auth.integration.test.ts
    prompt: |
      Implement: POST /auth/login handler, POST /auth/logout handler,
      authMiddleware for protecting routes.
      Wire up AuthService. Make integration tests pass.

  # ── Stage 6: Acceptance Tests ─────────────────────────────────────────────
  - id: acceptance
    type: llm
    description: Verify acceptance tests pass end-to-end
    agent: foreman-verifier
    deps:
      - impl-handler
    inputs: []
    outputs: []
    scope: []
    validate:
      - tests-pass: src/__tests__/auth.acceptance.test.ts
    prompt: |
      Run acceptance tests and verify they all pass.
      Report any failures with root cause analysis.

  # ── Stage 7: Full Integration ─────────────────────────────────────────────
  - id: integration
    type: deterministic
    description: Run full test suite to confirm nothing is broken
    command: |
      npm test 2>&1 | tee .foreman/nodes/add-auth/integration/output.txt
      exit \${PIPESTATUS[0]}
    deps:
      - acceptance
    outputs:
      - .foreman/nodes/add-auth/integration/output.txt
    validate:
      - exit-code: 0
`;

// .foreman/.gitignore content
export const FOREMAN_GITIGNORE = `.current-scope
.current-node
*.lock
`;
