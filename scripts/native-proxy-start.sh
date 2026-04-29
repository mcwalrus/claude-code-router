#!/usr/bin/env bash
# Start CCR natively on port 3456 with staging validation before cutover.
# Validates on a free staging port first; stops ccr-local-proxy only after staging passes.
# Restores ~/.claude-code-router config and optionally restarts Docker on failure.
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ── Config detection ──────────────────────────────────────────────────────────
if [ -f "config.jsonc" ]; then
    LOCAL_CFG="config.jsonc"
elif [ -f "config.json" ]; then
    LOCAL_CFG="config.json"
else
    echo -e "${RED}Error:${NC} No config.jsonc or config.json found in repo root."
    exit 1
fi

if [ ! -f ".env" ]; then
    echo -e "${RED}Error:${NC} .env file not found in repo root."
    exit 1
fi

# ── Parse APIKEY from local config ───────────────────────────────────────────
APIKEY=$(node -e "
  const { parse } = require('./packages/shared/node_modules/jsonc-parser/lib/umd/main');
  const cfg = parse(require('fs').readFileSync('${LOCAL_CFG}', 'utf8')) || {};
  console.log(cfg.APIKEY || '');
")

# ── Find a free staging port ──────────────────────────────────────────────────
STAGING_PORT=$(python3 -c '
import socket
s = socket.socket()
s.bind(("", 0))
print(s.getsockname()[1])
s.close()
')

# ── Install config before staging ────────────────────────────────────────────
CCR_CONFIG_DIR="${HOME}/.claude-code-router"
mkdir -p "${CCR_CONFIG_DIR}/logs"

[ -f "${CCR_CONFIG_DIR}/config.json" ]  && cp "${CCR_CONFIG_DIR}/config.json"  /tmp/ccr-native-bak.json
[ -f "${CCR_CONFIG_DIR}/config.jsonc" ] && cp "${CCR_CONFIG_DIR}/config.jsonc" /tmp/ccr-native-bak.jsonc
rm -f "${CCR_CONFIG_DIR}/config.json" "${CCR_CONFIG_DIR}/config.jsonc"
cp "${LOCAL_CFG}" "${CCR_CONFIG_DIR}/config.jsonc"

# ── Cleanup / rollback functions ──────────────────────────────────────────────
restore_config() {
    rm -f "${CCR_CONFIG_DIR}/config.json" "${CCR_CONFIG_DIR}/config.jsonc"
    [ -f /tmp/ccr-native-bak.json ]  && cp /tmp/ccr-native-bak.json  "${CCR_CONFIG_DIR}/config.json"
    [ -f /tmp/ccr-native-bak.jsonc ] && cp /tmp/ccr-native-bak.jsonc "${CCR_CONFIG_DIR}/config.jsonc"
}

cutover_started=0
restart_docker() {
    if [ "${cutover_started}" -eq 1 ] && docker image inspect ccr:local >/dev/null 2>&1; then
        if [ -f "config.jsonc" ]; then cfg="config.jsonc"; else cfg="config.json"; fi
        docker run -d \
            --name ccr-local-proxy \
            -p 3456:3456 \
            -e NODE_ENV=production \
            --env-file .env \
            -v "$(pwd)/${cfg}:/root/.claude-code-router/config.jsonc:ro" \
            ccr:local \
            node /app/packages/server/dist/index.js >/dev/null 2>&1 || true
    fi
}

STAGING_PID=""
cleanup() {
    [ -n "${STAGING_PID}" ] && kill "${STAGING_PID}" 2>/dev/null || true
    rm -f .ccr-native-staging.pid
    restore_config
    restart_docker
}
trap cleanup ERR EXIT

# ── Load env and start staging process ───────────────────────────────────────
set -a; source .env; set +a

NODE_ENV=production CCR_PORT=${STAGING_PORT} CCR_HOST=127.0.0.1 \
    node packages/server/dist/index.js \
    >> "${CCR_CONFIG_DIR}/logs/native-proxy.log" 2>&1 &
STAGING_PID=$!
echo "${STAGING_PID}" > .ccr-native-staging.pid

printf "Staging (:%s)" "${STAGING_PORT}"
i=0
while [ $i -lt 15 ]; do
    if curl -sf "http://127.0.0.1:${STAGING_PORT}/health" >/dev/null 2>&1; then break; fi
    printf "."
    sleep 1
    i=$((i+1))
done
echo ""

if ! curl -sf "http://127.0.0.1:${STAGING_PORT}/health" >/dev/null 2>&1; then
    echo -e "${RED}Staging health: FAIL${NC}"
    exit 1
fi

if [ -n "${APIKEY}" ]; then
    auth_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "x-api-key: ${APIKEY}" \
        "http://127.0.0.1:${STAGING_PORT}/v1/probe")
    if [ "${auth_code}" != "404" ]; then
        echo -e "${RED}Staging auth: FAIL (HTTP ${auth_code})${NC}"
        exit 1
    fi
fi

# ── Kill staging, cut over to port 3456 ──────────────────────────────────────
kill "${STAGING_PID}" 2>/dev/null || true
rm -f .ccr-native-staging.pid
STAGING_PID=""

cutover_started=1
docker rm -f ccr-local-proxy >/dev/null 2>&1 || true

NODE_ENV=production CCR_PORT=3456 CCR_HOST=127.0.0.1 \
    node packages/server/dist/index.js \
    >> "${CCR_CONFIG_DIR}/logs/native-proxy.log" 2>&1 &
NATIVE_PID=$!
echo "${NATIVE_PID}" > .ccr-native.pid

printf "Starting (:3456)"
i=0
while [ $i -lt 10 ]; do
    if curl -sf "http://127.0.0.1:3456/health" >/dev/null 2>&1; then break; fi
    printf "."
    sleep 1
    i=$((i+1))
done
echo ""

if ! curl -sf "http://127.0.0.1:3456/health" >/dev/null 2>&1; then
    echo -e "${RED}Health: FAIL${NC}"
    exit 1
fi

if [ -n "${APIKEY}" ]; then
    auth_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "x-api-key: ${APIKEY}" \
        "http://127.0.0.1:3456/v1/probe")
    if [ "${auth_code}" != "404" ]; then
        echo -e "${RED}Auth: FAIL (HTTP ${auth_code})${NC}"
        exit 1
    fi
fi

# ── Success ───────────────────────────────────────────────────────────────────
trap - ERR EXIT

echo "PID:       ${NATIVE_PID}"
echo "URL:       http://127.0.0.1:3456"
echo "Health:    OK"
[ -n "${APIKEY}" ] && echo "Auth:      OK"

if [ -n "${APIKEY}" ]; then
    if [ -z "${ANTHROPIC_AUTH_TOKEN:-}" ]; then
        echo ""
        echo "Note: shell not configured — run: just shell-setup"
    elif [ "${ANTHROPIC_AUTH_TOKEN}" != "${APIKEY}" ]; then
        echo ""
        echo -e "${YELLOW}Warning: ANTHROPIC_AUTH_TOKEN does not match proxy APIKEY${NC}"
        echo "         Claude Code requests will be rejected (401)"
        echo "         Fix: just shell-setup"
    fi
fi
