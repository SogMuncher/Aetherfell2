#!/bin/bash
# Claude Code session start (cloud only): install packages quietly so threads never spend a step on it.
[ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
[ -d node_modules ] || npm ci --silent --no-audit --no-fund >/dev/null 2>&1 || echo "npm ci failed; run it by hand"
exit 0
