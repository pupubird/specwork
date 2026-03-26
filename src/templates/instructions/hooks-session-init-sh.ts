export const HOOKS_SESSION_INIT_SH = `#!/bin/bash
# SessionStart hook — detect active Foreman workflow

if [ -d ".foreman" ]; then
  ACTIVE=$(find .foreman/graph -name "state.yaml" -exec grep -l "status: active" {} \\; 2>/dev/null | head -1)

  if [ -n "$ACTIVE" ]; then
    CHANGE_DIR=$(dirname "$ACTIVE")
    CHANGE=$(basename "$CHANGE_DIR")
    echo "{\\"additionalContext\\": \\"Foreman workflow active: \${CHANGE}. Run /project:foreman-status \${CHANGE} for details.\\"}" >&2
  fi
fi

exit 0
`;
