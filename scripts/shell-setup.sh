#!/usr/bin/env bash
# Configure the current user's shell to route Claude Code through the local proxy.
# Appends a guarded block to ~/.zshrc and/or ~/.bashrc (idempotent).
# Must be run from the repository root.
set -euo pipefail

# ── Locate config file ────────────────────────────────────────────────────────
if [ -f "config.jsonc" ]; then
    CONFIG="config.jsonc"
elif [ -f "config.json" ]; then
    CONFIG="config.json"
else
    echo "Error: no config file found in the current directory."
    echo "Run 'just setup' first, then edit config.jsonc with your settings."
    exit 1
fi

# ── Parse APIKEY and PORT from config ────────────────────────────────────────
# Uses the workspace's jsonc-parser (direct dep of @CCR/shared).
# Plain node require works fine here — the impl/* issue only affects esbuild bundling.
APIKEY=$(node -e "
  const { parse } = require('./packages/shared/node_modules/jsonc-parser/lib/umd/main');
  const cfg = parse(require('fs').readFileSync('$CONFIG', 'utf8')) || {};
  console.log(cfg.APIKEY || 'test');
")
PORT=$(node -e "
  const { parse } = require('./packages/shared/node_modules/jsonc-parser/lib/umd/main');
  const cfg = parse(require('fs').readFileSync('$CONFIG', 'utf8')) || {};
  console.log(cfg.PORT || 3456);
")

# ── Resolve \$VAR references in APIKEY from .env ──────────────────────────────
if [[ "$APIKEY" == \$* ]]; then
    VAR_NAME="${APIKEY#\$}"
    VAR_NAME="${VAR_NAME#\{}"
    VAR_NAME="${VAR_NAME%\}}"
    if [ -f .env ]; then
        while IFS='=' read -r key val || [ -n "$key" ]; do
            # Strip leading whitespace and skip comments / blank lines
            key="${key#"${key%%[![:space:]]*}"}"
            [[ -z "$key" || "$key" == \#* ]] && continue
            if [ "$key" = "$VAR_NAME" ]; then
                APIKEY="$val"
                break
            fi
        done < .env
    fi
    if [[ "$APIKEY" == \$* ]]; then
        echo "Warning: APIKEY references \$$VAR_NAME but it is not defined in .env."
        echo "         Set it manually after running this script."
        APIKEY="proxy-auth-key"
    fi
fi

BASE_URL="http://127.0.0.1:${PORT}"

# ── Build the shell block ─────────────────────────────────────────────────────
MARKER="# CCR: Claude Code Router local proxy"
read -r -d '' BLOCK << SHELL_BLOCK || true
$MARKER
export ANTHROPIC_AUTH_TOKEN="$APIKEY"
export ANTHROPIC_BASE_URL="$BASE_URL"
export NO_PROXY="127.0.0.1"
export DISABLE_TELEMETRY="true"
export DISABLE_COST_WARNINGS="true"
SHELL_BLOCK

# ── Determine target rc files ─────────────────────────────────────────────────
# macOS: zsh is default; bash users have ~/.bash_profile (not ~/.bashrc).
# Linux: bash default; zsh users typically have ~/.zshrc.
RC_FILES=()
[ -f "$HOME/.zshrc" ]         && RC_FILES+=("$HOME/.zshrc")
[ -f "$HOME/.bashrc" ]        && RC_FILES+=("$HOME/.bashrc")
[ -f "$HOME/.bash_profile" ]  && [[ ! " ${RC_FILES[*]} " == *".bashrc"* ]] && RC_FILES+=("$HOME/.bash_profile")

# Fall back to creating ~/.zshrc if nothing found (macOS new user)
if [ ${#RC_FILES[@]} -eq 0 ]; then
    RC_FILES=("$HOME/.zshrc")
    touch "$HOME/.zshrc"
    echo "Created $HOME/.zshrc"
fi

# ── Write to each rc file ─────────────────────────────────────────────────────
configured=0
for rc in "${RC_FILES[@]}"; do
    if grep -q "$MARKER" "$rc" 2>/dev/null; then
        echo "Already configured in $(basename "$rc") — skipping."
    else
        printf '\n%s\n' "$BLOCK" >> "$rc"
        echo "✓ Added proxy config to $rc"
        configured=$((configured + 1))
    fi
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
if [ $configured -gt 0 ]; then
    echo "Done. Future shell sessions will route Claude Code through $BASE_URL"
    echo ""
    echo "Apply to the current session:"
    for rc in "${RC_FILES[@]}"; do
        echo "  source $rc"
    done
else
    echo "No changes — all shell configs were already up to date."
fi
