# Plan: native-proxy — Run CCR Natively on Port 3456

## Goal

Add a `just native-proxy` Justfile target that safely runs the local CCR build as a
native Node.js process on port `3456` — the same port occupied by the Docker container
started by `just local-proxy` — without disrupting that container while it is running.

## Background

`just local-proxy` starts a Docker container named `ccr-local-proxy` that:
- Mounts `config.jsonc` (or `config.json`) read-only to `/root/.claude-code-router/config.json`
- Loads environment from `.env`
- Exposes port `3456` on `127.0.0.1`
- Performs health + auth probes before declaring success

Running CCR natively (without Docker) is useful for:
- Faster iteration during development (no image rebuild required)
- Attaching debuggers (`--inspect`)
- Avoiding Docker networking overhead when gascity-runner containers connect via
  `host.docker.internal:3456`

## Safety Constraint

The Docker container must NOT be stopped unless the native process has already been
validated. The cutover sequence is:

1. Build server artifacts if missing (`pnpm build:server`)
2. Copy local `config.jsonc` → `~/.claude-code-router/config.json` (back up existing)
3. Start native CCR on a **staging port** (random free port)
4. Validate staging port: health check + auth probe
5. **Only if staging passes**: stop Docker container → start native on `3456` → validate
6. If production-port validation fails: kill native process, restore Docker container,
   restore backed-up config, exit non-zero

## Implementation

### 1. `.gitignore` additions

Add entries so runtime files don't appear in `git status`:
```
.ccr-native.pid
.ccr-native-config.bak
```

### 2. `scripts/native-proxy-start.sh`

Shell script encapsulating the full startup + cutover logic.

Responsibilities:
- Accept `--port <port>` flag (default `3456`)
- Accept `--staging-port <port>` flag (default: find a free port via Python)
- Accept `--skip-docker-stop` flag (start natively without touching Docker)
- Source `.env` to export API key vars into the process environment
- Parse `APIKEY` from `config.jsonc` (via `jq`) for the auth probe
- Backup `~/.claude-code-router/config.json` → `~/.claude-code-router/config.json.native-bak`
  if it exists and is different from the local config
- Copy local `config.jsonc` (or `config.json`) to `~/.claude-code-router/config.json`
- Launch `NODE_ENV=production PORT=<staging_port> HOST=127.0.0.1 \
         node packages/server/dist/index.js` in the background
- Redirect stdout/stderr to `~/.claude-code-router/logs/native-proxy.log`
- Write PID to `.ccr-native.pid`
- Poll `http://127.0.0.1:<staging_port>/health` for 15 s (same pattern as `local-proxy`)
- Run auth probe against staging port (same 404-means-OK logic)
- If staging fails: kill process, remove PID file, restore config backup, exit 1
- If `--skip-docker-stop` is set: restart process on target port and finish
- Otherwise: `docker rm -f ccr-local-proxy` (graceful), then restart on `3456`
- Poll health on `3456` (10 s — Docker is already stopped, so just checking native)
- If production-port validation fails: kill native, restore Docker (`docker run …` same
  flags as `local-proxy` target), restore config backup, exit 1
- Print status block (same format as `just local-proxy` output)
- Warn if `ANTHROPIC_AUTH_TOKEN` doesn't match `APIKEY`

### 3. `scripts/native-proxy-stop.sh`

- Read PID from `.ccr-native.pid`; error if missing
- `kill -TERM <pid>` and wait up to 5 s for graceful exit, then `kill -KILL`
- Remove `.ccr-native.pid`
- Restore `~/.claude-code-router/config.json.native-bak` if it exists
- Print "Stopped."

### 4. Justfile targets

```just
# Run CCR as a native Node.js process on port 3456 (safe cutover from Docker).
# Validates on a staging port before stopping ccr-local-proxy.
# Run `just build` first if server artifacts are missing.
native-proxy: _check-config
    #!/usr/bin/env sh
    set -e
    if [ ! -f packages/server/dist/index.js ]; then
        echo "Server not built. Building..."
        pnpm build:server
    fi
    bash scripts/native-proxy-start.sh

# Stop the native CCR process started by native-proxy
native-proxy-stop:
    @bash scripts/native-proxy-stop.sh

# Show status of the native CCR process
native-proxy-status:
    #!/usr/bin/env sh
    if [ ! -f .ccr-native.pid ]; then
        echo "Not running (no PID file)"
        exit 0
    fi
    pid=$(cat .ccr-native.pid)
    if kill -0 "$pid" 2>/dev/null; then
        echo "Running (PID $pid)"
        curl -sf http://127.0.0.1:3456/health && echo "Health: OK" || echo "Health: FAIL"
    else
        echo "Stale PID file (process $pid not found)"
        rm -f .ccr-native.pid
    fi
```

### 5. Logging

Native CCR writes to `~/.claude-code-router/logs/native-proxy.log`. A convenience
target surfaces the tail:

```just
# Stream native proxy logs
native-proxy-logs:
    tail -f ~/.claude-code-router/logs/native-proxy.log
```

## Acceptance Criteria

- `just native-proxy` starts CCR natively on port `3456`
- If Docker `ccr-local-proxy` is running, it is stopped ONLY after staging validation
- If native fails at any validation step, Docker container is NOT stopped (or is
  restarted if it was already stopped)
- `just native-proxy-stop` terminates the process cleanly and restores the backed-up
  `~/.claude-code-router/config.json`
- Health check passes at `http://127.0.0.1:3456/health`
- Auth probe returns `404` (same semantics as `just local-proxy`)
- Shell env mismatch warning shown when `ANTHROPIC_AUTH_TOKEN` ≠ `APIKEY`
- PID file `.ccr-native.pid` and config backup are gitignored
- `native-proxy-status` correctly reports running/stopped/stale

## Out of Scope

- Hot-reload / file watching (use `just worktree-dev` for that)
- Running natively on a non-default port (add `--port` in a future iteration)
- Replacing `just local-proxy` (both targets coexist; `native-proxy` is opt-in)
