# ── Build stage ───────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

# hadolint ignore=DL3016 -- pnpm requires @latest; lockfile pins transitive deps
RUN npm install -g pnpm@latest && \
    rm -rf /root/.npm

# Copy workspace config files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY scripts ./scripts
COPY packages/shared/package.json ./packages/shared/
COPY packages/core/package.json ./packages/core/
COPY packages/server/package.json ./packages/server/

# Install all dependencies (including dev) and prune store
RUN pnpm install --frozen-lockfile && \
    pnpm store prune

# Copy source and build
COPY packages/shared ./packages/shared
COPY packages/core ./packages/core
COPY packages/server ./packages/server

WORKDIR /app/packages/core
RUN pnpm build

WORKDIR /app/packages/shared
RUN pnpm build

WORKDIR /app/packages/server
RUN pnpm build && \
    rm -rf node_modules/.cache

# ── Production stage ──────────────────────────────────────────────────────
FROM node:24-alpine AS production

# Optional runtime env vars (no defaults — container stays flexible):
#   CCR_PORT                         — TCP port (default from config.jsonc: 3456)
#   CCR_HOST                         — Bind address (default from config.jsonc: 127.0.0.1)
#   CCR_APIKEY                       — Proxy auth secret
#   CCR_API_TIMEOUT_MS               — Upstream timeout in ms
#   CCR_LOG_LEVEL                    — fatal | error | warn | info | debug | trace
#   CCR_NON_INTERACTIVE_MODE         — true/false
#   CCR_PROXY_URL                    — HTTP proxy URL
#   CCR_ROUTER_DEFAULT               — "provider,model" default route
#   CCR_ROUTER_BACKGROUND            — "provider,model" lightweight tasks
#   CCR_ROUTER_THINK                 — "provider,model" reasoning tasks
#   CCR_ROUTER_LONG_CONTEXT          — "provider,model" long-context tasks
#   CCR_ROUTER_LONG_CONTEXT_THRESHOLD — number of tokens
#   CCR_ROUTER_WEB_SEARCH            — "provider,model" web-search tasks
#   CCR_ROUTER_IMAGE                 — "provider,model" image tasks
#   CCR_PLUGINS                      — JSON array of plugin configs
# Pass via --env-file, -e, or docker run -e CCR_PORT=8080 ...

# hadolint ignore=DL3018,DL3016
RUN apk add --no-cache curl && \
    npm install -g pm2 pm2-logrotate --no-scripts && \
    pm2 install pm2-logrotate && \
    pm2 set pm2-logrotate:max_size 100M && \
    pm2 set pm2-logrotate:retain 5 && \
    pm2 set pm2-logrotate:compress true && \
    pm2 set pm2-logrotate:rotateInterval '0 0 * * *'

WORKDIR /app

# Copy core package (workspace dependency)
COPY --from=builder /app/packages/core ./packages/core

# Copy production dependencies
COPY --from=builder /app/packages/server/node_modules ./packages/server/node_modules

# Copy server bundle
COPY --from=builder /app/packages/server/dist ./packages/server/dist

# Copy pre-built UI assets into server dist
COPY packages/ui/dist/. ./packages/server/dist/

# Copy PM2 config
COPY packages/server/ecosystem.config.cjs /app/

# Create log directory
RUN mkdir -p /root/.claude-code-router/logs

EXPOSE 3456

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://127.0.0.1:3456/health || exit 1

CMD ["pm2-runtime", "start", "/app/ecosystem.config.cjs"]
