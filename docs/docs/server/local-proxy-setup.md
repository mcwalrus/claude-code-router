---
sidebar_position: 3
---

# Local Proxy Setup (Native Node)

Run the router directly as a Node.js process — no Docker required. Best for active development where you want fast rebuild-and-restart cycles.

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 8
- Repository cloned and dependencies installed (`pnpm install`)

## 1. First-Time Setup

Copy the config and env templates:

```bash
just setup
```

This creates:
- `config.jsonc` — your provider and routing config (from `config.example.jsonc`)
- `.env` — your API keys (from `.env.example`)

Edit both files before proceeding. At minimum, set your provider's `api_key` in `config.jsonc` and the corresponding key in `.env`.

:::note PORT must be an integer
`PORT` in `config.jsonc` must be a number, not a string:
```json
"PORT": 3456   ✓
"PORT": "3456" ✗
```
:::

## 2. Build

```bash
pnpm build
```

This builds all packages in dependency order: `shared` → `core` → `server` → `cli` → `ui`.

To rebuild only the server (faster after server-only changes):

```bash
pnpm build:server
```

## 3. Validate Config

```bash
just validate-config
```

Checks that providers, router references, and env var placeholders are consistent. Fix any errors before starting.

## 4. Start the Proxy

```bash
just native-proxy
```

The script:
1. Starts the server on a temporary staging port and health-checks it
2. Stops any running Docker proxy (`ccr-local-proxy` container)
3. Cuts over to port `3456`
4. Writes the PID to `.ccr-native.pid`

Expected output:

```
Staging (:XXXXX).
Starting (:3456).
PID:       12345
URL:       http://127.0.0.1:3456
Health:    OK
Auth:      OK
```

## 5. Configure Shell Environment (One-Time)

Wire Claude Code to route through the proxy:

```bash
just shell-setup
```

This appends `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, and `ANTHROPIC_API_URL` to `~/.zshrc` / `~/.bashrc`. Apply to the current session:

```bash
source ~/.zshrc
```

To also put the local `ccr` binary (v3) on your PATH ahead of any globally installed version:

```bash
just dev-setup
source ~/.zshrc
```

## Day-to-Day Commands

| Task | Command |
|---|---|
| Check proxy is running | `just native-proxy-status` |
| Stream logs | `just native-proxy-logs` |
| Stop the proxy | `just native-proxy-stop` |
| Restart after code change | `pnpm build:server && just native-proxy` |
| Validate config | `just validate-config` |

## Stopping the Proxy

```bash
just native-proxy-stop
```

## Troubleshooting

### Proxy starts but health check fails

Check the log:

```bash
just native-proxy-logs
# or
tail -50 ~/.claude-code-router/logs/native-proxy.log
```

Common causes:
- `PORT` is a string in `config.jsonc` — must be an integer
- Port 3456 already in use — check with `lsof -i :3456`
- Missing or invalid `APIKEY` in `config.jsonc`

### "Auth: FAIL" during startup

The server started but rejected its own auth probe. This usually means the config wasn't loaded from the expected path. Check:

```bash
ls ~/.claude-code-router/config.json
```

`native-proxy` copies your local `config.jsonc` there before starting.

### Claude Code gets 401 errors

Your shell env doesn't match the proxy's `APIKEY`. Re-run:

```bash
just shell-setup
source ~/.zshrc
```

Verify the match:

```bash
echo $ANTHROPIC_AUTH_TOKEN
grep APIKEY config.jsonc
```

### Stale PID file

If the process died without cleaning up:

```bash
rm .ccr-native.pid
just native-proxy
```
