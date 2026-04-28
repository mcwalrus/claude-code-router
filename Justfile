# CCR local Docker commands
# Copy .env.example to .env and fill in your API keys before running

# Run unit tests
test:
    pnpm test

# Install git pre-commit hook (run once after cloning)
install-hooks:
    cp scripts/hooks/pre-commit .git/hooks/pre-commit
    chmod +x .git/hooks/pre-commit
    @echo "pre-commit hook installed"

build:
    pnpm build
    docker build -f packages/server/Dockerfile -t ccr:local .

# Run production image with generic config mount
run: build
    docker run -it --rm \
        -p 3456:3456 \
        --env-file .env \
        -v ~/.claude-code-router/config.json:/root/.claude-code-router/config.json \
        ccr:local

# Run as local dev proxy with a named config from config/
# Usage: just dev           (defaults to gemini-2.5)
#        just dev deepseek-v4-pro
dev config="gemini-2.5":
    docker run -it --rm \
        -p 3456:3456 \
        --env-file .env \
        -v "$(pwd)/config/{{config}}.json:/root/.claude-code-router/config.json:ro" \
        ccr:local

# List available dev configs
configs:
    @ls config/*.json 2>/dev/null | xargs -n1 basename | sed 's/\.json$//' || echo "No configs found in config/"

# Run debug image (Debian 13 trixie, with shell tools)
run-debug config="gemini-2.5":
    docker build -f packages/server/Dockerfile.debug -t ccr:debug .
    docker run -it --rm \
        -p 3456:3456 \
        --env-file .env \
        -v "$(pwd)/config/{{config}}.json:/root/.claude-code-router/config.json:ro" \
        ccr:debug
