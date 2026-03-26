export const HOOKS_TYPE_CHECK_SH = `#!/bin/bash
# PostToolUse hook for Write|Edit
# Runs tsc --noEmit after editing TypeScript files

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')

if [[ "$FILE_PATH" == *.ts ]] || [[ "$FILE_PATH" == *.tsx ]]; then
  RESULT=$(npx tsc --noEmit 2>&1)
  if [ $? -ne 0 ]; then
    echo "TYPE ERROR after editing $FILE_PATH:" >&2
    echo "$RESULT" >&2
  fi
fi

exit 0
`;
