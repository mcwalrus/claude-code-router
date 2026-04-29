#!/usr/bin/env bash
# Stop the native CCR process started by native-proxy-start.sh.
# Restores ~/.claude-code-router config to its pre-proxy state.
set -euo pipefail

PID_FILE=".ccr-native.pid"
CCR_CONFIG_DIR="${HOME}/.claude-code-router"

if [ ! -f "${PID_FILE}" ]; then
    echo "Not running."
    exit 0
fi

PID=$(cat "${PID_FILE}")

if ! kill -0 "${PID}" 2>/dev/null; then
    echo "Stale PID file (process ${PID} not found). Cleaning up."
    rm -f "${PID_FILE}"
    exit 0
fi

kill "${PID}"
i=0
while [ $i -lt 5 ]; do
    if ! kill -0 "${PID}" 2>/dev/null; then break; fi
    sleep 1
    i=$((i+1))
done

if kill -0 "${PID}" 2>/dev/null; then
    kill -9 "${PID}" 2>/dev/null || true
fi

rm -f "${PID_FILE}"
rm -f "${CCR_CONFIG_DIR}/.claude-code-router.pid"

# Restore config to pre-proxy state
rm -f "${CCR_CONFIG_DIR}/config.json" "${CCR_CONFIG_DIR}/config.jsonc"
[ -f /tmp/ccr-native-bak.json ]  && cp /tmp/ccr-native-bak.json  "${CCR_CONFIG_DIR}/config.json"
[ -f /tmp/ccr-native-bak.jsonc ] && cp /tmp/ccr-native-bak.jsonc "${CCR_CONFIG_DIR}/config.jsonc"

echo "Stopped."
