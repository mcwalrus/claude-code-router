# CCR Docker Stack

This directory contains configuration files for the CCR local Docker Compose stack.

## Services

| Service | Port(s) | Image | Description |
|---------|---------|-------|-------------|
| `ccr-local` | `3456` (proxy), `9464` (metrics) | Built from `packages/server/Dockerfile` | Host-facing CCR; routes to upstream providers |
| `ccr-hop` | `3457→3456` | Built from `packages/server/Dockerfile` | Inner CCR; forwards to `ccr-local` via `host.docker.internal` |
| `prometheus` | `9090` | `prom/prometheus:v3.2.1` | Scrapes CCR metrics |
| `otel-collector` | `4317` (gRPC), `4318` (HTTP) | `otel/opentelemetry-collector:latest` | Optional; accepts OTLP traces/metrics |

## Quick Start

```bash
# Copy and edit your config
just setup

# Build the CCR image and start all services
just stack-up

# Verify everything is healthy
just stack-status
```

## Stack Commands

| Command | Description |
|---------|-------------|
| `just stack-up` | Start stack, wait for health checks, print URLs |
| `just stack-down` | Stop and remove all stack containers |
| `just stack-logs` | Stream logs from `ccr-local` |
| `just stack-metrics` | Dump CCR Prometheus metrics to stdout |
| `just stack-status` | Show running services and health |
| `just stack-build` | Rebuild CCR Docker image |
| `just stack-restart` | Restart stack (add `--build` to rebuild first) |
| `just stack-test` | Run integration smoke tests against the live stack |

## Configuration Files

| File | Description |
|------|-------------|
| `docker/prometheus.yml` | Prometheus scrape config; targets `ccr-local:9464` |
| `docker/hop-config.jsonc` | CCR config for `ccr-hop`; points providers at `host.docker.internal:3456` |
| `docker/otel-config.yml` | OTel Collector config (optional); receives OTLP on 4317/4318, logs to stdout |

## Hop-Proxy Topology

```
Claude Code
    │
    ▼ :3457
ccr-hop  (Docker, PROXY_HOP=gascity)
    │
    ▼ host.docker.internal:3456
ccr-local  (Docker, has real API keys)
    │
    ▼
Upstream providers (Anthropic, Gemini, etc.)
```

The `ccr-hop` service simulates a gascity-runner container that forwards all Claude Code requests to a host-side CCR, which then routes to the real upstream API.

## OTel Collector (Optional)

The OTel Collector profile collects OTLP traces and metrics and logs them to stdout — no external backend required.

```bash
# Start the full stack including the OTel Collector
docker compose --profile otel up -d

# Verify the collector is ready
docker compose logs otel-collector | grep -i ready
```

Send traces to `http://localhost:4318/v1/traces` (HTTP) or `localhost:4317` (gRPC).

## Build Optimisation

The `.dockerignore` at the repo root excludes:
- `node_modules/` (re-installed inside the builder stage)
- `.env`, `config.json`, `config.jsonc` (mounted at runtime, never baked in)
- `.beads/`, `.claude/`, `docs/`, `plans/` (not needed in image)

Layer caching: `pnpm install` runs before `COPY packages/*/src` so dependency layers are only invalidated when `pnpm-lock.yaml` or `package.json` files change — not when source code changes.

## Troubleshooting

**CCR fails to start:**
```bash
docker compose logs ccr-local
```

**Prometheus not scraping:**
```bash
curl http://localhost:9090/api/v1/targets
```

**Port already in use:**
```bash
lsof -ti:3456 | xargs kill -9
```

**host.docker.internal not resolving (Linux):**

Add `--add-host=host.docker.internal:host-gateway` to the `ccr-hop` service in `docker-compose.yml`, or set:
```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```
