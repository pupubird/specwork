export const HOOKS_SESSION_INIT_SH = `#!/bin/bash
# SessionStart hook — detect active Specwork workflow and version mismatch

if [ -d ".specwork" ]; then
  # Check for version mismatch between config and manifest
  if [ -f ".specwork/config.yaml" ] && [ -f ".specwork/manifest.yaml" ]; then
    PROJECT_VERSION=$(grep "^specwork_version:" .specwork/config.yaml 2>/dev/null | sed 's/specwork_version: *//;s/"//g;s/'"'"'//g' | tr -d '[:space:]')
    MANIFEST_VERSION=$(grep "^specwork_version:" .specwork/manifest.yaml 2>/dev/null | sed 's/specwork_version: *//;s/"//g;s/'"'"'//g' | tr -d '[:space:]')
    if [ -n "$PROJECT_VERSION" ] && [ -n "$MANIFEST_VERSION" ] && [ "$PROJECT_VERSION" != "$MANIFEST_VERSION" ]; then
      echo "Specwork version mismatch: project $PROJECT_VERSION, manifest $MANIFEST_VERSION. Run specwork update to migrate."
    fi
  fi

  # Check for active workflows
  ACTIVE=$(find .specwork/graph -name "state.yaml" -exec grep -l "status: active" {} \\; 2>/dev/null | head -1)

  if [ -n "$ACTIVE" ]; then
    CHANGE_DIR=$(dirname "$ACTIVE")
    CHANGE=$(basename "$CHANGE_DIR")
    echo "{\\"additionalContext\\": \\"Specwork workflow active: \${CHANGE}. Run /project:specwork-status \${CHANGE} for details.\\"}" >&2
  fi
fi

exit 0
`;
