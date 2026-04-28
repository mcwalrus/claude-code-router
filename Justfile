# CCR local Docker commands
# Copy .env.example to .env and fill in your API keys before running

build:
    pnpm build
    docker build -f packages/server/Dockerfile -t ccr:local .

run: build
    docker run -it --rm \
        -p 3456:3456 \
        --env-file .env \
        -v ~/.claude-code-router/config.json:/root/.claude-code-router/config.json \
        ccr:local

run-debug:
    docker build -f packages/server/Dockerfile.debug -t ccr:debug .
    docker run -it --rm \
        -p 3456:3456 \
        --env-file .env \
        -v ~/.claude-code-router/config.json:/root/.claude-code-router/config.json \
        ccr:debug
