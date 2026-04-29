#!/usr/bin/env bash
# ============================================================
# Claude Code Router Diagnostics
# Identifies routing config, running processes, and connectivity
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[OK]${NC}    $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $1"; }
err()  { echo -e "${RED}[FAIL]${NC}  $1"; }
info() { echo -e "${BLUE}[INFO]${NC}  $1"; }
section() { echo -e "\n${BLUE}══════════════════════════════${NC}"; echo -e "${BLUE} $1${NC}"; echo -e "${BLUE}══════════════════════════════${NC}"; }

# ── 1. Environment Variables ──────────────────────────────
section "1. Claude Code Environment Variables"

ENV_VARS=(
  ANTHROPIC_API_KEY
  ANTHROPIC_BASE_URL
  ANTHROPIC_AUTH_TOKEN
  ANTHROPIC_MODEL
  CLAUDE_CODE_USE_BEDROCK
  CLAUDE_CODE_USE_VERTEX
  CLAUDE_CODE_USE_FOUNDRY
  HTTP_PROXY
  HTTPS_PROXY
  NO_PROXY
)

for var in "${ENV_VARS[@]}"; do
  val="${!var}"
  if [[ -n "$val" ]]; then
    # Mask keys — show first 8 chars only
    if [[ "$var" == *KEY* || "$var" == *TOKEN* || "$var" == *SECRET* ]]; then
      masked="${val:0:8}..."
      ok "$var = $masked (set, masked)"
    else
      ok "$var = $val"
    fi
  else
    warn "$var = (not set)"
  fi
done

# ── 2. Claude Code Config Files ───────────────────────────
section "2. Claude Code Config Files"

CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
info "Config directory: $CLAUDE_DIR"

if [[ -d "$CLAUDE_DIR" ]]; then
  ok "Config directory exists"
else
  err "Config directory not found: $CLAUDE_DIR"
fi

SETTINGS_FILE="$CLAUDE_DIR/settings.json"
if [[ -f "$SETTINGS_FILE" ]]; then
  ok "settings.json found"
  echo ""
  info "Contents of settings.json:"
  # Show settings but mask any keys
  cat "$SETTINGS_FILE" | sed 's/"apiKey": *"[^"]*"/"apiKey": "***MASKED***"/g' \
                        | sed 's/"token": *"[^"]*"/"token": "***MASKED***"/g'
  echo ""
else
  warn "settings.json not found"
fi

# Check for env block in settings
if [[ -f "$SETTINGS_FILE" ]]; then
  if grep -q '"env"' "$SETTINGS_FILE" 2>/dev/null; then
    ok "settings.json contains an 'env' block (proxy/env config found)"
  else
    info "No 'env' block in settings.json"
  fi
  if grep -q 'baseUrl\|ANTHROPIC_BASE_URL' "$SETTINGS_FILE" 2>/dev/null; then
    warn "settings.json references a custom base URL — this may be pointing at your killed router"
  fi
fi

# ── 3. Running Router Processes ───────────────────────────
section "3. Router / Proxy Processes"

ROUTER_PATTERNS=("litellm" "openai-proxy" "nginx" "caddy" "traefik" "envoy" "node.*proxy" "python.*proxy" "claude.*router" "mitmproxy" "haproxy")

found_any=false
for pattern in "${ROUTER_PATTERNS[@]}"; do
  matches=$(pgrep -af "$pattern" 2>/dev/null | grep -v "grep\|diagnose_claude")
  if [[ -n "$matches" ]]; then
    ok "Found process matching '$pattern':"
    echo "$matches" | while read -r line; do echo "        $line"; done
    found_any=true
  fi
done

if ! $found_any; then
  warn "No common router/proxy processes found running"
  info "Your router may be down. Check what you usually run to start it."
fi

# ── 4. Port Check ─────────────────────────────────────────
section "4. Common Router Ports"

PORTS=(4000 8080 8000 8888 3000 11434 1080 9090)

for port in "${PORTS[@]}"; do
  if command -v nc &>/dev/null; then
    nc -z -w1 127.0.0.1 "$port" 2>/dev/null && ok "Port $port is OPEN (something listening)" || info "Port $port closed"
  elif command -v lsof &>/dev/null; then
    lsof -i ":$port" &>/dev/null && ok "Port $port is OPEN" || info "Port $port closed"
  fi
done

# Check what's actually listening
section "4b. All Listening Ports (local)"
if command -v ss &>/dev/null; then
  ss -tlnp 2>/dev/null | grep -v "^State" | awk '{print $1, $4, $6}' | while read -r state addr proc; do
    info "LISTEN $addr  $proc"
  done
elif command -v netstat &>/dev/null; then
  netstat -tlnp 2>/dev/null | grep LISTEN | awk '{print $4, $7}' | while read -r addr proc; do
    info "LISTEN $addr  $proc"
  done
else
  warn "Neither ss nor netstat found — cannot list listening ports"
fi

# ── 5. Connectivity to Anthropic ──────────────────────────
section "5. Direct Anthropic API Connectivity"

ANTHROPIC_HOST="api.anthropic.com"

if command -v curl &>/dev/null; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "https://$ANTHROPIC_HOST" 2>/dev/null)
  if [[ "$HTTP_CODE" -ge 200 && "$HTTP_CODE" -lt 500 ]]; then
    ok "Reached $ANTHROPIC_HOST (HTTP $HTTP_CODE)"
  else
    err "Cannot reach $ANTHROPIC_HOST (HTTP $HTTP_CODE or timeout)"
  fi
else
  warn "curl not found — skipping connectivity check"
fi

# Test the configured base URL if set
if [[ -n "$ANTHROPIC_BASE_URL" ]]; then
  info "Testing configured ANTHROPIC_BASE_URL: $ANTHROPIC_BASE_URL"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$ANTHROPIC_BASE_URL" 2>/dev/null)
  if [[ "$HTTP_CODE" -ge 200 && "$HTTP_CODE" -lt 500 ]]; then
    ok "Router at $ANTHROPIC_BASE_URL is reachable (HTTP $HTTP_CODE)"
  else
    err "Router at $ANTHROPIC_BASE_URL is NOT reachable (HTTP $HTTP_CODE or timeout)"
    warn "→ Your router may be down. Try: unset ANTHROPIC_BASE_URL"
  fi
fi

# ── 6. Claude Binary ──────────────────────────────────────
section "6. Claude Code Binary"

if command -v claude &>/dev/null; then
  CLAUDE_PATH=$(which claude)
  ok "claude found at: $CLAUDE_PATH"
  CLAUDE_VERSION=$(claude --version 2>/dev/null)
  [[ -n "$CLAUDE_VERSION" ]] && info "Version: $CLAUDE_VERSION"
else
  err "claude binary not found in PATH"
  info "You may need to reinstall: npm install -g @anthropic-ai/claude-code"
fi

# ── 7. Summary & Recommendations ─────────────────────────
section "7. Summary & Recommended Actions"

if [[ -n "$ANTHROPIC_BASE_URL" ]]; then
  echo ""
  warn "ANTHROPIC_BASE_URL is set to: $ANTHROPIC_BASE_URL"
  echo "  This means Claude Code is routing through a proxy/router."
  echo "  If your router is down, run one of:"
  echo ""
  echo "    # Temporarily bypass (this shell session only):"
  echo "    unset ANTHROPIC_BASE_URL"
  echo ""
  echo "    # Or permanently remove it from your shell profile (~/.bashrc / ~/.zshrc)"
  echo "    # and remove any 'env.ANTHROPIC_BASE_URL' from ~/.claude/settings.json"
else
  info "ANTHROPIC_BASE_URL is not set — Claude Code should talk directly to Anthropic"
  info "If it's still failing, check your ANTHROPIC_API_KEY is valid"
fi

echo ""
info "To test Claude Code directly after changes:"
echo "    claude --version"
echo "    claude -p 'say hello'"
echo ""