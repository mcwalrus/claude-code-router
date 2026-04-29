---
sidebar_position: 4
---

# Docker Proxy Setup

Run the router as a Docker container. Best for a stable, production-like environment or when you don't want Node.js on your host.

## Prerequisites

- Docker (with the daemon running)
- Repository cloned and dependencies installed (`pnpm install`)

## 1. First-Time Setup

```bash
just setup
```

Creates `config.jsonc` and `.env` from their templates. Edit both with your provider API keys before continuing.

## 2. Build

```bash
just build
```

This runs `pnpm build` followed by `docker build`, producing a local image tagged `ccr:local`.

To rebuild just the Docker image after a code change:

```bash
just build
```

(Always rebuilds both — the image is built from the compiled dist output.)

## 3. Start the Proxy

```bash
just local-proxy
```

The script:
1. Verifies `config.jsonc` (or `config.json`) and `.env` exist
2. Removes any previous `ccr-local-proxy` container
3. Starts a new detached container on port `3456`
4. Polls `/health` until the server responds
5. Probes auth with your `APIKEY`

Expected output:

```
Container: abc123def456  (ccr-local-proxy)
URL:       http://127.0.0.1:3456
Health:    OK
Auth:      OK
```

## 4. Configure Shell Environment (One-Time)

Wire Claude Code to route through the proxy:

```bash
just shell-setup
```

Appends `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, and `ANTHROPIC_API_URL` to `~/.zshrc` / `~/.bashrc`. Apply to the current session:

```bash
source ~/.zshrc
```

## Day-to-Day Commands

| Task | Command |
|---|---|
| Start proxy | `just local-proxy` |
| Stop proxy | `just proxy-stop` |
| Stream container logs | `docker logs -f ccr-local-proxy` |
| Check health | `curl http://127.0.0.1:3456/health` |
| List running containers | `docker ps --filter name=ccr` |

## Using an Alternate Config

To start with a named config from the `config/` directory:

```bash
just dev gemini-2.5
```

List available configs:

```bash
just configs
```

## Full Observability Stack

To run the router alongside Prometheus for metrics:

```bash
just stack-up
```

This starts:
- `ccr-local` — router on `:3456`
- `prometheus` — metrics on `:9090`
- Metrics endpoint — `:9464/metrics`

```bash
just stack-down     # tear down
just stack-logs     # stream CCR logs
just stack-metrics  # print current metrics
```

## Stopping the Proxy

```bash
just proxy-stop
```

## Troubleshooting

### "Image not found. Run: just build"

The `ccr:local` image hasn't been built yet:

```bash
just build
```

### Health check times out

The container started but the server never became healthy. Check logs:

```bash
docker logs ccr-local-proxy --tail 30
```

Common causes:
- `PORT` is a string in `config.jsonc` — must be an integer: `"PORT": 3456`
- Config file not mounted correctly — verify the volume path
- Missing `APIKEY` field in `config.jsonc`

### "Auth: FAIL (HTTP 401)"

The server is running but rejecting the auth probe. The config inside the container doesn't match what was expected. Verify:

```bash
docker exec ccr-local-proxy cat /root/.claude-code-router/config.json
```

### Claude Code gets 401 errors

Your shell `ANTHROPIC_AUTH_TOKEN` doesn't match the proxy's `APIKEY`. Re-run:

```bash
just shell-setup
source ~/.zshrc
```

### Port 3456 already in use

Another process (or a previous proxy run) is holding the port:

```bash
lsof -i :3456
just proxy-stop        # if it's a previous CCR container
just native-proxy-stop # if it's a native CCR process
```
