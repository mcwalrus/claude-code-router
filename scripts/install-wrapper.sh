#!/usr/bin/env bash
# Installs a claude wrapper that shows a claude-code-router status banner before each session.
# The wrapper replaces the claude symlink at ~/.local/bin/claude.
set -e

WRAPPER_DEST="${CLAUDE_BIN:-$HOME/.local/bin/claude}"
CCR_PORT="${CCR_PORT:-3456}"

# Resolve the real claude binary path
if [ -L "$WRAPPER_DEST" ]; then
    REAL_CLAUDE=$(readlink "$WRAPPER_DEST")
    # Resolve relative symlinks
    if [[ "$REAL_CLAUDE" != /* ]]; then
        REAL_CLAUDE="$(dirname "$WRAPPER_DEST")/$REAL_CLAUDE"
    fi
elif [ -f "$WRAPPER_DEST" ]; then
    echo "Error: $WRAPPER_DEST exists and is not a symlink."
    echo "If a previous wrapper install is in place, run uninstall-wrapper.sh first."
    exit 1
else
    echo "Error: claude not found at $WRAPPER_DEST"
    echo "Set CLAUDE_BIN to the path of your claude binary and retry."
    exit 1
fi

if [ ! -f "$REAL_CLAUDE" ]; then
    echo "Error: Resolved path does not exist: $REAL_CLAUDE"
    exit 1
fi

echo "Found real claude at: $REAL_CLAUDE"
echo "Installing wrapper at: $WRAPPER_DEST"

# Replace symlink with wrapper script
rm "$WRAPPER_DEST"

cat > "$WRAPPER_DEST" << WRAPPER
#!/usr/bin/env bash
if curl -s --max-time 1 "http://localhost:${CCR_PORT}" -o /dev/null 2>/dev/null; then
    printf '\n  \xe2\x9c\x93  claude-code-router active\n\n'
    ANTHROPIC_BASE_URL="http://localhost:${CCR_PORT}" exec "${REAL_CLAUDE}" "\$@"
else
    printf '\n  \xe2\x9c\x97  claude-code-router not connected -- run: ccr start\n\n'
    exec "${REAL_CLAUDE}" "\$@"
fi
WRAPPER

chmod +x "$WRAPPER_DEST"

echo "Done. Run 'claude' to verify."
echo ""
echo "To uninstall: bash scripts/uninstall-wrapper.sh"
