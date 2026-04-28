#!/usr/bin/env bash
# Removes the claude wrapper and restores the original symlink pointing to the
# installed claude version under ~/.local/share/claude.
set -e

WRAPPER_DEST="${CLAUDE_BIN:-$HOME/.local/bin/claude}"
CLAUDE_VERSIONS_DIR="$HOME/.local/share/claude/versions"

if [ ! -f "$WRAPPER_DEST" ] || [ -L "$WRAPPER_DEST" ]; then
    echo "No wrapper found at $WRAPPER_DEST (already a symlink or missing). Nothing to do."
    exit 0
fi

# Find the latest installed claude version to restore the symlink
LATEST=$(ls -1 "$CLAUDE_VERSIONS_DIR" 2>/dev/null | sort -V | tail -1)
if [ -z "$LATEST" ]; then
    echo "Error: Could not find a claude version under $CLAUDE_VERSIONS_DIR"
    echo "Remove $WRAPPER_DEST manually and reinstall claude."
    exit 1
fi

REAL_CLAUDE="$CLAUDE_VERSIONS_DIR/$LATEST"
echo "Restoring symlink: $WRAPPER_DEST -> $REAL_CLAUDE"

rm "$WRAPPER_DEST"
ln -s "$REAL_CLAUDE" "$WRAPPER_DEST"

echo "Done."
