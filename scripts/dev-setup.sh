#!/usr/bin/env bash
# Add the repo's ./bin directory to PATH in shell rc files.
# This makes `ccr` resolve to the local v3.0.0 build instead of the stale
# global npm install (typically v2.0.0).
#
# Idempotent — safe to run multiple times.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${REPO_ROOT}/bin"

if [ ! -f "${BIN_DIR}/ccr" ]; then
    echo "Error: ${BIN_DIR}/ccr not found. Run 'pnpm build' first."
    exit 1
fi

# Verify the local binary is actually v3+
local_version=$("${BIN_DIR}/ccr" -v 2>/dev/null | sed 's/.*version: //')
if [[ ! "$local_version" =~ ^3\. ]]; then
    echo "Warning: local bin/ccr is not v3.x (got: ${local_version})"
    echo "Run 'pnpm build' and try again."
    exit 1
fi

MARKER="# CCR: local dev PATH"

# Build the block that prepends ./bin to PATH.
# We use a temp file + cat to avoid heredoc variable-expansion pitfalls.
block_file=$(mktemp)
cat > "$block_file" <<EOF
${MARKER}
# Use the local ccr (v${local_version}) from this repo instead of the global install.
# This overrides the stale npm global ccr (v2.0.0).
export PATH="${BIN_DIR}:\${PATH}"
EOF
BLOCK=$(cat "$block_file")
rm "$block_file"

# Determine target rc files
RC_FILES=()
[ -f "$HOME/.zshrc" ]         && RC_FILES+=("$HOME/.zshrc")
[ -f "$HOME/.bashrc" ]        && RC_FILES+=("$HOME/.bashrc")
[ -f "$HOME/.bash_profile" ]  && [[ ! " ${RC_FILES[*]} " == *".bashrc"* ]] && RC_FILES+=("$HOME/.bash_profile")

# Fall back to creating ~/.zshrc
if [ ${#RC_FILES[@]} -eq 0 ]; then
    RC_FILES=("$HOME/.zshrc")
    touch "$HOME/.zshrc"
    echo "Created $HOME/.zshrc"
fi

# Write to each rc file (replace existing block if present)
configured=0
for rc in "${RC_FILES[@]}"; do
    if grep -q "$MARKER" "$rc" 2>/dev/null; then
        # Remove the old block (marker line through the next blank line)
        tmp=$(mktemp)
        awk "/${MARKER}/{found=1} found && /^\$/{found=0; next} !found" "$rc" > "$tmp"
        mv "$tmp" "$rc"
        printf '\n%s\n' "$BLOCK" >> "$rc"
        echo "✓ Updated local dev PATH in $rc"
        configured=$((configured + 1))
    else
        printf '\n%s\n' "$BLOCK" >> "$rc"
        echo "✓ Added local dev PATH to $rc"
        configured=$((configured + 1))
    fi
done

echo ""
echo "Done. Future shell sessions will use the local ccr (v${local_version})"
echo ""
echo "Apply to the current session:"
for rc in "${RC_FILES[@]}"; do
    echo "  source $rc"
done
echo ""
echo "Or run directly:"
echo "  export PATH=\"${BIN_DIR}:\${PATH}\""
