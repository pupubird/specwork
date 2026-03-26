export const HOOKS_SCOPE_GUARD_SH = `#!/bin/bash
# PreToolUse hook for Write|Edit
# Reads JSON from stdin with tool_input.file_path
# Exit 2 = block the operation

INPUT=$(cat)

# Parse file path — prefer jq, fall back to grep/sed
if command -v jq &>/dev/null; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')
else
  FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"\\s*:\\s*"[^"]*"' | head -1 | sed 's/.*"file_path"\\s*:\\s*"//;s/"$//')
  [ -z "$FILE_PATH" ] && FILE_PATH=$(echo "$INPUT" | grep -o '"path"\\s*:\\s*"[^"]*"' | head -1 | sed 's/.*"path"\\s*:\\s*"//;s/"$//')
fi

SCOPE_FILE=".foreman/.current-scope"
if [ -f "$SCOPE_FILE" ] && [ -n "$FILE_PATH" ]; then
  ALLOWED=false
  while IFS= read -r pattern; do
    if [[ "$FILE_PATH" == $pattern* ]]; then
      ALLOWED=true
      break
    fi
  done < "$SCOPE_FILE"

  if [ "$ALLOWED" = false ]; then
    echo "BLOCKED: $FILE_PATH is outside scope. Allowed: $(cat $SCOPE_FILE)" >&2
    exit 2
  fi
fi

exit 0
`;
