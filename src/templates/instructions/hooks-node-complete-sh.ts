export const HOOKS_NODE_COMPLETE_SH = `#!/bin/bash
# SubagentStop hook — generate preliminary L2 context after node completion
# NOTE: This generates L2 from git diff + verify.md. The foreman-summarizer agent
# may later overwrite L2.md with a richer version that includes subagent output.
# The summarizer's version takes precedence — this hook provides a baseline.

INPUT=$(cat)
AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // empty')

if [[ "$AGENT_ID" == foreman-* ]]; then
  CURRENT_NODE_FILE=".foreman/.current-node"
  if [ -f "$CURRENT_NODE_FILE" ]; then
    NODE_INFO=$(cat "$CURRENT_NODE_FILE")
    CHANGE=$(echo "$NODE_INFO" | cut -d'/' -f1)
    NODE=$(echo "$NODE_INFO" | cut -d'/' -f2)

    NODE_DIR=".foreman/nodes/\${CHANGE}/\${NODE}"
    mkdir -p "$NODE_DIR"

    git diff HEAD~1 2>/dev/null | grep -v '^---' > "\${NODE_DIR}/L2.md"
    if [ -f "\${NODE_DIR}/verify.md" ]; then
      echo "---" >> "\${NODE_DIR}/L2.md"
      cat "\${NODE_DIR}/verify.md" >> "\${NODE_DIR}/L2.md"
    fi

    echo "Node \${NODE} artifacts saved. L0/L1 generation pending." >&2
  fi
fi

exit 0
`;
