# CCR local Docker commands
# Copy .env.example to .env and fill in your API keys before running

# Run unit tests
test:
    pnpm test

# Run full CI checks (justfile syntax + tests + type checking)
ci:
    just --list >/dev/null
    pnpm ci

# Install git pre-commit hook (run once after cloning)
install-hooks:
    cp scripts/hooks/pre-commit .git/hooks/pre-commit
    chmod +x .git/hooks/pre-commit
    @echo "pre-commit hook installed"

build:
    pnpm build
    docker build -f packages/server/Dockerfile -t ccr:local .

# Run production image with home-dir config mount (config.jsonc preferred over config.json)
local-run: build
    #!/usr/bin/env sh
    if [ -f ~/.claude-code-router/config.jsonc ]; then
        mount="-v ~/.claude-code-router/config.jsonc:/root/.claude-code-router/config.json"
    else
        mount="-v ~/.claude-code-router/config.json:/root/.claude-code-router/config.json"
    fi
    docker run -it --rm -p 3456:3456 --env-file .env $mount ccr:local

# First-time setup: copy config.example.jsonc → config.jsonc and .env.example → .env
# Edit both files with your API keys before running `just proxy`.
# Usage: just setup              — copy templates only
#        just setup local-proxy  — also configure shell env for all future sessions
setup target="":
    #!/usr/bin/env sh
    if [ -f config.jsonc ] || [ -f config.json ]; then
        echo "Config already exists — skipping config copy."
    else
        cp config.example.jsonc config.jsonc
        echo "✓ Created config.jsonc"
    fi
    if [ -f .env ]; then
        echo "✓ .env already exists — skipping."
    else
        cp .env.example .env
        echo "✓ Created .env"
    fi
    echo ""
    echo "Next steps:"
    echo "  1. Edit config.jsonc — set your providers, models, and router rules"
    echo "  2. Edit .env        — add your API keys (ANTHROPIC_API_KEY, etc.)"
    if [ "{{target}}" = "local-proxy" ]; then
        echo ""
        bash scripts/shell-setup.sh
    else
        echo "  3. Run: just local-proxy"
        echo ""
        echo "  To also configure your shell env for future sessions:"
        echo "    just setup local-proxy   (or: just shell-setup)"
    fi

# Configure your shell (~/.zshrc / ~/.bashrc) to route Claude Code through the
# local proxy. Reads APIKEY and PORT from config.jsonc. Idempotent.
shell-setup:
    @bash scripts/shell-setup.sh

# Internal: verify config.jsonc (or config.json) and .env exist before running
[private]
_check-config:
    #!/usr/bin/env sh
    if [ ! -f config.jsonc ] && [ ! -f config.json ]; then
        echo "Error: no config file found. Run 'just setup' first."
        exit 1
    fi
    if [ ! -f .env ]; then
        echo "Error: .env not found. Run 'just setup' first."
        exit 1
    fi

# Run as a local router proxy. Requires config.jsonc (or config.json) and .env to exist.
# Run `just setup` then `just build` first if you haven't already.
# Starts detached, polls /health, checks auth, and warns on shell env mismatch.
local-proxy: _check-config
    #!/usr/bin/env sh
    if ! docker image inspect ccr:local >/dev/null 2>&1; then
        echo "Image not found. Run: just build"
        exit 1
    fi
    if [ -f config.jsonc ]; then cfg=config.jsonc; else cfg=config.json; fi
    docker rm -f ccr-local-proxy >/dev/null 2>&1 || true
    docker run -d \
        --name ccr-local-proxy \
        -p 3456:3456 \
        -e NODE_ENV=production \
        --env-file .env \
        -v "$(pwd)/${cfg}:/root/.claude-code-router/config.json:ro" \
        ccr:local \
        node /app/packages/server/dist/index.js >/dev/null
    printf "Starting"
    i=0
    while [ $i -lt 15 ]; do
        if curl -sf http://127.0.0.1:3456/health >/dev/null 2>&1; then break; fi
        printf "."
        sleep 1
        i=$((i+1))
    done
    echo ""
    if ! curl -sf http://127.0.0.1:3456/health >/dev/null 2>&1; then
        echo "Health:    FAIL"
        docker logs ccr-local-proxy --tail 20
        docker rm -f ccr-local-proxy >/dev/null 2>&1
        exit 1
    fi
    cid=$(docker ps -q --filter name=ccr-local-proxy)
    echo "Container: ${cid}  (ccr-local-proxy)"
    echo "URL:       http://127.0.0.1:3456"
    echo "Health:    OK"
    # Auth probe: hit a non-existent route with the config's APIKEY.
    # 404 = config loaded and auth accepted. 401 = config not being read.
    apikey=$(jq -r '.APIKEY // empty' "${cfg}" 2>/dev/null)
    if [ -n "$apikey" ]; then
        auth_code=$(curl -s -o /dev/null -w "%{http_code}" \
            -H "x-api-key: ${apikey}" \
            http://127.0.0.1:3456/v1/probe)
        if [ "$auth_code" = "404" ]; then
            echo "Auth:      OK"
        else
            echo "Auth:      FAIL (HTTP ${auth_code} — config may not be loaded)"
            docker logs ccr-local-proxy --tail 10
            exit 1
        fi
    else
        echo "Auth:      SKIP (no APIKEY in ${cfg})"
    fi
    # Warn if the shell env doesn't match — Claude Code will get 401s
    if [ -n "$apikey" ]; then
        if [ -z "${ANTHROPIC_AUTH_TOKEN}" ]; then
            echo ""
            echo "Note: shell not configured — run: just shell-setup"
        elif [ "${ANTHROPIC_AUTH_TOKEN}" != "${apikey}" ]; then
            echo ""
            echo "Warning: ANTHROPIC_AUTH_TOKEN does not match proxy APIKEY"
            echo "         Claude Code requests will be rejected (401)"
            echo "         Fix: just shell-setup"
        fi
    fi

# Stop the local proxy container started by local-proxy
proxy-stop:
    docker rm -f ccr-local-proxy >/dev/null 2>&1 && echo "Stopped." || echo "Not running."

# Run as local dev proxy with a named config from config/
# Usage: just dev           (defaults to gemini-2.5)
#        just dev deepseek-v4-pro
dev config="gemini-2.5":
    #!/usr/bin/env sh
    if [ -f "config/{{config}}.jsonc" ]; then
        cfg="config/{{config}}.jsonc"
    else
        cfg="config/{{config}}.json"
    fi
    docker run -it --rm \
        -p 3456:3456 \
        --env-file .env \
        -v "$(pwd)/${cfg}:/root/.claude-code-router/config.json:ro" \
        ccr:local

# List available dev configs
configs:
    @{ ls config/*.jsonc 2>/dev/null; ls config/*.json 2>/dev/null; } | xargs -n1 basename | sed 's/\.\(json\|jsonc\)$//' | sort -u || echo "No configs found in config/"

# Run debug image (Debian 13 trixie, with shell tools)
run-debug config="gemini-2.5":
    docker build -f packages/server/Dockerfile.debug -t ccr:debug .
    docker run -it --rm \
        -p 3456:3456 \
        --env-file .env \
        -v "$(pwd)/config/{{config}}.json:/root/.claude-code-router/config.json:ro" \
        ccr:debug
