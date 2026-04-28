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
run: build
    #!/usr/bin/env sh
    if [ -f ~/.claude-code-router/config.jsonc ]; then
        mount="-v ~/.claude-code-router/config.jsonc:/root/.claude-code-router/config.jsonc"
    else
        mount="-v ~/.claude-code-router/config.json:/root/.claude-code-router/config.json"
    fi
    docker run -it --rm -p 3456:3456 --env-file .env $mount ccr:local

# Run as local router proxy using config.jsonc (or config.json) at the project root.
# On first run, copies config.example.jsonc → config.jsonc for you to fill in.
# Usage: just proxy
proxy: build
    #!/usr/bin/env sh
    if [ ! -f config.jsonc ] && [ ! -f config.json ]; then
        cp config.example.jsonc config.jsonc
        echo "Created config.jsonc — edit it with your API keys, then re-run: just proxy"
        exit 1
    fi
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
