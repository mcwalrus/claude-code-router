---
title: "Native Proxy — Run CCR Natively on Port 3456"
created: 2026-04-29
poured:
  - ccr-mol-r268
  - ccr-mol-x33g
  - ccr-mol-vbon
  - ccr-mol-yg9z
  - ccr-mol-zjns
  - ccr-mol-k0is
  - ccr-mol-8yyb
  - ccr-mol-oxso
  - ccr-mol-asbd
  - ccr-mol-a9ow
  - ccr-mol-fhxu
  - ccr-mol-vbil
iteration: 1
auto_discovery: false
auto_learnings: false
---
<project_specification>
<project_name>Native Proxy — Run CCR Natively on Port 3456</project_name>

  <overview>
    Add a `just native-proxy` Justfile target that runs the local CCR server build
    as a native Node.js process on port 3456 — the same port used by `just local-proxy`
    (the Docker-based proxy). The transition must be safe: the Docker container
    ccr-local-proxy is stopped only AFTER the native process has been validated on a
    staging port. If any validation step fails, the Docker container is not disturbed
    (or is restarted if it was already stopped during cutover).

    This is useful for development iteration (no image rebuild required), attaching
    debuggers, and ensuring gascity-runner containers can reach the proxy via
    host.docker.internal:3456 without Docker networking overhead.
  </overview>

  <context>
    <existing_patterns>
      - Shell scripts use `set -euo pipefail` for strict error handling
      - ANSI color codes (RED/GREEN/YELLOW) used for user-facing output in scripts
      - Config parsing done via `node -e` with jsonc-parser (see scripts/shell-setup.sh)
      - Port probing uses `curl -sf http://... /dev/null 2>&1` (same as local-proxy Justfile target)
      - Idempotency via `grep -q` checks before appending to files (shell-setup.sh)
      - Script naming: hyphenated, lowercase, verb-first (dev-setup.sh, shell-setup.sh)
      - Process discovery uses `pgrep -af` rather than PID files (diagnose.sh pattern)
      - Free port discovery via `python3 -c 'import socket; ...'` (worktree-dev target)
    </existing_patterns>
    <integration_points>
      - Justfile: new targets `native-proxy`, `native-proxy-stop`, `native-proxy-status`, `native-proxy-logs` integrate alongside existing `local-proxy` and `proxy-stop`
      - `packages/server/dist/index.js`: entrypoint for native process — built by `pnpm build:server`
      - `~/.claude-code-router/config.json` and `config.jsonc`: config is loaded from these hardcoded paths (no CCR_CONFIG env var); both cannot coexist (server throws if both present)
      - `.env`: loaded by `local-proxy`; native-proxy must source same file to export API key env vars
      - `.gitignore`: must be extended to exclude the PID file and config backup files
      - `CCR_PORT` and `CCR_HOST` env vars: supported by `packages/shared/src/env-config.ts` to override port and bind address without touching config file
    </integration_points>
    <new_technologies>
      - No new technologies. Pattern reuses shell idioms already in this repo.
    </new_technologies>
    <conventions>
      - Scripts live in `scripts/` with hyphenated names
      - Justfile targets use `_check-config` private recipe as a guard
      - Health probe: `curl -sf http://127.0.0.1:<port>/health`
      - Auth probe: APIKEY read via `jq -r '.APIKEY // empty'`; HTTP 404 means auth accepted
      - Shell env mismatch warning: compare `ANTHROPIC_AUTH_TOKEN` with APIKEY from config
      - Build artifact guard: check `packages/server/dist/index.js` exists, build if not
    </conventions>
  </context>

  <tasks>

    <task id="gitignore" priority="0" category="infrastructure">
      <title>Extend .gitignore for native-proxy runtime files</title>
      <description>
        Add entries to .gitignore so the PID file and config backup files created by
        the native-proxy scripts never appear in `git status`.
      </description>
      <steps>
        - Append to `.gitignore`:
          ```
          # native-proxy runtime files
          .ccr-native.pid
          .claude-code-router-config.native-bak.json
          .claude-code-router-config.native-bak.jsonc
          ```
      </steps>
      <test_steps>
        1. Run `git status` — confirm the new entries are not listed as untracked
        2. Create a dummy `.ccr-native.pid` file and confirm `git status` ignores it
        3. Remove the dummy file
      </test_steps>
      <review></review>
    </task>

    <task id="native-proxy-start-script" priority="1" category="functional">
      <title>Write scripts/native-proxy-start.sh</title>
      <description>
        Shell script that safely starts CCR natively, validates it on a staging port,
        then cuts over to port 3456 (stopping the Docker container only after staging
        passes). Falls back to restarting Docker if cutover validation fails.

        Config handling: the server has no CCR_CONFIG env var — config must live at
        ~/.claude-code-router/config.json (or .jsonc). If both exist the server throws,
        so we must back up and remove both before writing the local config.

        Port/host override: CCR_PORT and CCR_HOST env vars are supported by the shared
        package and take precedence over the config file values.
      </description>
      <steps>
        - Add shebang and `set -euo pipefail`
        - Define color output helpers (RED/GREEN/YELLOW/NC ANSI codes)
        - Validate `config.jsonc` or `config.json` exists in repo root; exit 1 if not
        - Validate `.env` exists; exit 1 if not
        - Detect which local config file to use (`config.jsonc` preferred over `config.json`)
        - Find a free staging port using `python3 -c 'import socket; ...'`
        - Parse APIKEY from local config using `node -e` with jsonc-parser (same pattern as shell-setup.sh)
        - **Config installation step** (runs before staging start):
          - Backup `~/.claude-code-router/config.json` if it exists → `/tmp/ccr-native-bak.json`
          - Backup `~/.claude-code-router/config.jsonc` if it exists → `/tmp/ccr-native-bak.jsonc`
          - Remove both originals (prevents "both exist" error from server)
          - Copy local config to `~/.claude-code-router/config.json`
        - Define `restore_config()` function that removes our config and restores backups
        - Define `restart_docker()` function that re-runs the Docker container (same flags as `just local-proxy`)
        - Set trap for ERR and EXIT to call `restore_config` and `restart_docker` if cutover started
        - **Start staging process**:
          - Export API keys from `.env` (use `set -a; source .env; set +a`)
          - Launch: `CCR_PORT=<staging> CCR_HOST=127.0.0.1 NODE_ENV=production node packages/server/dist/index.js >> ~/.claude-code-router/logs/native-proxy.log 2>&1 &`
          - Write PID to `.ccr-native-staging.pid`
          - Poll `http://127.0.0.1:<staging>/health` for up to 15 s
          - Run auth probe on staging port; exit 1 on failure (trap cleans up)
        - Kill staging process; remove staging PID file
        - **Cutover**: set flag `cutover_started=1`
          - Stop Docker: `docker rm -f ccr-local-proxy >/dev/null 2>&1 || true`
          - Launch: `CCR_PORT=3456 CCR_HOST=127.0.0.1 NODE_ENV=production node packages/server/dist/index.js >> ~/.claude-code-router/logs/native-proxy.log 2>&1 &`
          - Write PID to `.ccr-native.pid`
          - Poll `http://127.0.0.1:3456/health` for 10 s
          - Run auth probe on 3456; exit 1 on failure (trap restarts Docker)
        - Clear trap (success — no rollback)
        - Print status block: PID, URL, Health OK, Auth OK
        - Warn if `ANTHROPIC_AUTH_TOKEN` is unset or doesn't match APIKEY (same logic as `local-proxy`)
      </steps>
      <test_steps>
        1. Run `just native-proxy` with Docker ccr-local-proxy already running — confirm Docker is stopped only after staging passes
        2. Run `just native-proxy` with no Docker container running — confirm it starts natively without touching Docker
        3. Manually kill the native process mid-startup (after staging but before 3456 comes up) — confirm the script restarts Docker and exits non-zero
        4. Check `~/.claude-code-router/logs/native-proxy.log` has output from the native process
        5. Confirm `.ccr-native.pid` contains the PID of the running node process
        6. Confirm `curl http://127.0.0.1:3456/health` returns 200
        7. Confirm auth probe (curl with APIKEY) returns 404
      </test_steps>
      <review></review>
    </task>

    <task id="native-proxy-stop-script" priority="1" category="functional">
      <title>Write scripts/native-proxy-stop.sh</title>
      <description>
        Shell script that terminates the native CCR process and restores the
        ~/.claude-code-router config to its pre-proxy state.
      </description>
      <steps>
        - Add shebang and `set -euo pipefail`
        - Check `.ccr-native.pid` exists; print "Not running." and exit 0 if missing
        - Read PID from `.ccr-native.pid`
        - If process is not alive (`kill -0` check), print "Stale PID file" and clean up
        - Send `SIGTERM` to PID; wait up to 5 s for graceful exit
        - If still alive after 5 s, send `SIGKILL`
        - Remove `.ccr-native.pid`
        - Restore config: remove `~/.claude-code-router/config.json` if it's ours,
          restore `/tmp/ccr-native-bak.json` and `/tmp/ccr-native-bak.jsonc` if they exist
        - Print "Stopped."
      </steps>
      <test_steps>
        1. After `just native-proxy`, run `just native-proxy-stop` — confirm process exits
        2. Confirm `.ccr-native.pid` is removed
        3. Confirm `~/.claude-code-router/config.json` is restored (or removed if no backup existed)
        4. Run `just native-proxy-stop` again — confirm "Not running." output and exit 0
        5. Run `just native-proxy-status` after stop — confirm it shows "Not running"
      </test_steps>
      <review></review>
    </task>

    <task id="justfile-targets" priority="1" category="infrastructure">
      <title>Add native-proxy Justfile targets</title>
      <description>
        Add four Justfile targets that wrap the scripts and mirror the UX of existing
        proxy targets (`local-proxy`, `proxy-stop`).
      </description>
      <steps>
        - Add `native-proxy` target after `local-proxy`:
          ```
          # Run CCR as a native Node.js process on port 3456.
          # Validates on a staging port before stopping ccr-local-proxy.
          native-proxy: _check-config
              #!/usr/bin/env sh
              set -e
              if [ ! -f packages/server/dist/index.js ]; then
                  echo "Server not built. Run: just build"
                  pnpm build:server
              fi
              bash scripts/native-proxy-start.sh
          ```
        - Add `native-proxy-stop` target after `proxy-stop`:
          ```
          # Stop the native CCR process started by native-proxy
          native-proxy-stop:
              @bash scripts/native-proxy-stop.sh
          ```
        - Add `native-proxy-status` target:
          ```
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
                  curl -sf http://127.0.0.1:3456/health >/dev/null && echo "Health: OK" || echo "Health: FAIL"
              else
                  echo "Stale PID file (process $pid not found)"
                  rm -f .ccr-native.pid
              fi
          ```
        - Add `native-proxy-logs` target:
          ```
          # Stream native proxy logs
          native-proxy-logs:
              tail -f ~/.claude-code-router/logs/native-proxy.log
          ```
      </steps>
      <test_steps>
        1. Run `just --list` — confirm all four new targets appear
        2. Run `just native-proxy` end-to-end and verify output matches `local-proxy` style
        3. Run `just native-proxy-status` while running — confirm "Running (PID ...)" and "Health: OK"
        4. Run `just native-proxy-stop` and then `just native-proxy-status` — confirm "Not running"
        5. Run `just native-proxy-logs` while process is running — confirm log output streams
      </test_steps>
      <review></review>
    </task>

  </tasks>

  <success_criteria>
    - `just native-proxy` starts CCR natively on port 3456 with health + auth verified
    - Docker ccr-local-proxy is stopped ONLY after staging validation succeeds
    - If any validation fails, Docker container is untouched (or restarted if mid-cutover)
    - `just native-proxy-stop` terminates cleanly and restores ~/.claude-code-router config
    - `just native-proxy-status` correctly reports running/stopped/stale
    - `.ccr-native.pid` and config backup files are gitignored
    - Shell env mismatch warning displayed when ANTHROPIC_AUTH_TOKEN doesn't match APIKEY
  </success_criteria>

</project_specification>
