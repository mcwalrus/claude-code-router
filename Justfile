# CCR local Docker commands
# Copy .env.example to .env and fill in your API keys before running

# Run unit tests
test:
    pnpm test

# Run full CI checks (tests + type checking)
ci:
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
        mount="-v ~/.claude-code-router/config.jsonc:/root/.claude-code-router/config.jsonc"
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
# Run `just setup` first if you haven't already.
local-proxy: _check-config build
    #!/usr/bin/env sh
    if [ -f config.jsonc ]; then
        cfg=config.jsonc
    else
        cfg=config.json
    fi
    docker run -it --rm \
        -p 3456:3456 \
        --env-file .env \
        -v "$(pwd)/${cfg}:/root/.claude-code-router/config.jsonc:ro" \
        ccr:local

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
        -v "$(pwd)/${cfg}:/root/.claude-code-router/config.jsonc:ro" \
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
