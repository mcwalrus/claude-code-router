---
title: "Claude Code Router — Gascity E2E Docker Integration"
created: 2026-04-29
poured:
  - ccr-mol-w844
  - ccr-mol-oowv
  - ccr-mol-0emv
  - ccr-mol-wb8o
  - ccr-mol-m18b
  - ccr-mol-bm2f
  - ccr-mol-83jt
  - ccr-mol-9phk
  - ccr-mol-s3ta
  - ccr-mol-5jr9
  - ccr-mol-z22p
  - ccr-mol-dwj9
  - ccr-mol-ddsg
  - ccr-mol-v0zx
  - ccr-mol-tn2c
  - ccr-mol-2vja
  - ccr-mol-rhfu
  - ccr-mol-jx8p
  - ccr-mol-wxnn
  - ccr-mol-kw4o
  - ccr-mol-ygrw
  - ccr-mol-b3jh
  - ccr-mol-4w5n
  - ccr-mol-s5c4
  - ccr-mol-1ume
  - ccr-mol-mw5i
  - ccr-mol-xc3j
  - ccr-mol-2l2r
  - ccr-mol-se12
  - ccr-mol-e8hm
iteration: 1
auto_discovery: false
auto_learnings: false
---
<project_specification>
<project_name>Claude Code Router — Gascity E2E Docker Integration</project_name>

<overview>
The `claude-code-router` monorepo is the core routing engine for the gascity runner.
In the `gascity-runner` Docker image, CCR is installed from npm (`npm install -g
@musistudio/claude-code-router`). The goal for this repo is to ensure the router can:
1. Run as a hop-proxy inside `gascity-runner` Docker, proxying to a local CCR
   instance running on the host.
2. Expose Prometheus metrics that the runner can scrape.
3. Have a local Docker-based test stack matching the runner's services.

This repo already has:
- A `Dockerfile` in `packages/server/Dockerfile` for standalone CCR
- A multi-arch Docker publish workflow
- PM2 for process management
- A metrics plugin (`packages/core/src/plugins/metrics.ts`)
- A `justfile` with local-proxy and worktree-dev targets

What is missing:
- A docker-compose.yml that matches the runner's Docker Compose stack
- The router configured as a hop-proxy (it already supports PROXY_HOP in config)
- Prometheus scrape annotations or config for the metrics plugin
- E2E test that validates the full hop-proxy chain: claude → gascity CCR → local CCR → upstream
</overview>

<technology_stack>
<runtime>Node.js 24, TypeScript, pnpm monorepo</runtime>
<framework>Fastify 5, tsup, PM2</framework>
<container>node:24-alpine, Docker Compose</container>
<observability>Prometheus (port 9464), pino logs, prom-client metrics</observability>
</technology_stack>

<context>
  <existing_patterns>
    - Monorepo: packages/shared, packages/core (@mcwalrus/llms), packages/server, packages/cli, packages/ui
    - Build: `pnpm build` → shared → core → server → cli → ui
    - Server Dockerfile: multi-stage (builder + production with PM2)
    - PM2 config: `packages/server/ecosystem.config.cjs`
    - Metrics plugin: already in packages/core/src/plugins/metrics.ts, uses prom-client
    - Local proxy: `just local-proxy` mounts config.jsonc + .env, runs on :3456
    - Worktree dev: `just worktree-dev` starts isolated container on random port
    - The server already exposes `/health` and the metrics plugin adds a separate HTTP server
  </existing_patterns>
  <integration_points>
    - packages/server/Dockerfile — keep as-is, may need hop-proxy config example
    - packages/core/src/plugins/metrics.ts — verify it works when CCR is a hop (hop label already supported)
    - config.example.jsonc — add PROXY_HOP example for gascity chain
    - docker-compose.yml (new) — CCR + Prometheus + optional OTel stack
    - docker/prometheus.yml (new) — scrape config targeting CCR metrics port
    - docs/upstreaming-llms-gap.md — document the llms metrics dependency
    - justfile — add `just stack-up` and `just stack-down` targets
  </integration_points>
  <new_technologies>
    - Docker compose overlay matching gascity-runner's services
    - Prometheus scrape config for CCR-specific metrics
    - Hop-proxy chain: gascity CCR (DOCKER_NET) → local CCR (HOST) → upstream provider
    - Worktree-aware agent harness (already partially built via just targets)
  </new_technologies>
  <conventions>
    - Justfile: clear sections, descriptive names
    - Config in JSON5 (config.jsonc), env in .env
    - All comments in English (project rule)
    - Docker: multi-stage builds, Node 24-alpine
    - Metrics: port 9464 by default, separate from proxy port
  </conventions>
</context>

<tasks>
  <task id="ccr-hop-proxy-config" priority="0" category="functional">
    <title>Document and validate hop-proxy chain configuration</title>
    <description>
      The CCR already supports PROXY_HOP and proxy chains. We need to document
      the specific hop configuration for the gascity runner: the gascity Docker
      CCR forwards to a local CCR on the host, which then routes to the final
      upstream provider.
    </description>
    <steps>
      - Add a "Hop Proxy — Gascity" example to `config.example.jsonc`:
        - `PROXY_HOP: "gascity"` on the inner container CCR
        - Target provider: `anthropic,claude-sonnet-4.6`
        - Outer (host) CCR configured with the same providers but no hop
      - Add a README section in `docs/` or inline about the hop chain:
        - Host: `ANTHROPIC_BASE_URL=http://gascity:3456` (from inside Docker)
        - This routes Claude Code → host proxy (:3456) → gascity proxy (:3457) → upstream
        - Actually we want the reverse: Claude Code → gascity CCR (in docker, port 3457 externally, 3456 internally) → local CCR (host, 3456) → upstream
      - Wait — re-check. The gascity runner has port `127.0.0.1:3457:3456`. So externally it's 3457, internally 3456. The local host CCR runs on :3456.
      - So the chain is: Claude Code on host → `http://127.0.0.1:3457` (gascity CCR) → `http://host.docker.internal:3456` (host CCR) → upstream.
      - Or: the gascity CCR can route directly if we configure Anthropic provider in its config.
      - The request says "setup as a hop-proxy to claude-code-router running locally". So gascity-runner CCR is a hop through to local CCR.
      - Update config.example.jsonc with the hop-proxy pattern for the gascity use case.
    </steps>
    <test_steps>
      1. `ccr start` with the hop config loads without errors
      2. A test request to the gascity CCR is forwarded to the local CCR
      3. Local CCR logs show the request arriving with `hop: "gascity"` label
    </test_steps>
    <review>
    </review>
  </task>

  <task id="ccr-docker-compose" priority="0" category="infrastructure">
    <title>Create docker-compose.yml matching gascity-runner stack</title>
    <description>
      Create a Docker Compose file for claude-code-router that mirrors the
      gascity-runner services so we can validate end-to-end before pushing
      changes to the runner image.
    </description>
    <steps>
      - Create `docker-compose.yml` at repo root:
        - `ccr` service: build from `packages/server/Dockerfile`, expose 3456 + 9464
        - `prometheus` service: scrape `ccr:9464`
        - `otel-collector` service: optional, for trace validation
        - `ccr-local` service: for the hop-proxy, mounts host config, exposes :3456
      - Add `docker/prometheus.yml` to scrape CCR metrics
      - Add `docker/otel-config.yml` for the optional OTel collector
      - Ensure `ccr-local` uses `host.docker.internal` to reach the host CCR
      - The network should match how gascity-runner compose works
    </steps>
    <test_steps>
      1. `docker compose up -d` starts the stack
      2. `curl http://localhost:3456/health` returns 200
      3. `curl http://localhost:9464/metrics` returns Prometheus text
      4. Prometheus (`:9090`) shows `ccr:9464` as UP
    </test_steps>
    <review>
    </review>
  </task>

  <task id="ccr-metrics-verify" priority="0" category="functional">
    <title>Verify metrics plugin exposes correct labels in hop mode</title>
    <description>
      When CCR runs as a hop, the metrics should include the `hop` label
      (`PROXY_HOP` value). Verify the metrics plugin works correctly
      when the proxy chain is active.
    </description>
    <steps>
      - Check `packages/core/src/plugins/metrics.ts`:
        - `ccr_provider_routes_total` and `ccr_tokens_total` already use `hop` label
        - Ensure the label is set from `config.PROXY_HOP || "default"`
      - Add a test in `packages/server/vitest.config.ts` area or write a new e2e test:
        - Send a request through the hop chain
        - Scrape metrics and assert `hop="gascity"` is present
      - Fix any issues where the hop label is not propagated
    </steps>
    <test_steps>
      1. `curl -s http://localhost:9464/metrics | grep hop=` shows the configured hop value
      2. After a request, `ccr_provider_routes_total{hop="gascity"}` is incremented
    </test_steps>
    <review>
    </review>
  </task>

  <task id="ccr-worktree-agent" priority="1" category="functional">
    <title>Improve worktree-dev target for multi-agent execution</title>
    <description>
      Agents need to run CCR in isolated worktrees. The `just worktree-dev` target
      exists but needs a companion target for orchestrating many agents.
    </description>
    <steps>
      - Add `just agent-dev <worktree-dir>`:
        - Detects if the worktree contains a `.claude` dir (agent context)
        - Starts a CCR container for that worktree on a unique port
        - Mounts the worktree's `.claude/settings.json` for per-agent config
        - Exposes the metrics port too
      - Add `just agent-list`: lists all running agent CCR containers
      - Add `just agent-stop <name>`: stops a specific agent container
      - Ensure containers are named `ccr-agent-<dirname>` to avoid collisions
    </steps>
    <test_steps>
      1. `just agent-dev /tmp/agent-wt-1` starts a container on a free port
      2. `just agent-list` shows the container
      3. `just agent-stop ccr-agent-agent-wt-1` removes it
    </test_steps>
    <review>
    </review>
  </task>

  <task id="ccr-just-stack" priority="1" category="infrastructure">
    <title>Add just targets for full stack up/down</title>
    <description>
      Convenient just targets to spin the whole observability stack up and down.
    </description>
    <steps>
      - Add `just stack-up`:
        - `docker compose up -d`
        - Wait for health checks: CCR `/health`, Prometheus `/graph`
        - Print URLs: CCR proxy, Prometheus, metrics endpoint
      - Add `just stack-down`: `docker compose down`
      - Add `just stack-logs`: `docker compose logs -f ccr`
      - Add `just stack-metrics`: `curl -s http://localhost:9464/metrics`
    </steps>
    <test_steps>
      1. `just stack-up` exits 0 and prints reachable URLs
      2. `just stack-metrics` returns Prometheus text
      3. `just stack-down` cleans up all containers
    </test_steps>
    <review>
    </review>
  </task>
</tasks>

<success_criteria>
  - Hop-proxy configuration works: gascity CCR → local CCR → upstream
  - `docker compose up -d` brings up CCR + Prometheus + OTel (optional)
  - Prometheus scrapes CCR metrics with `hop` label
  - Worktree dev targets support multi-agent execution
  - `just stack-up` / `stack-down` / `stack-metrics` are functional
  - No regression in existing `just local-proxy` or `just worktree-dev`
</success_criteria>
</project_specification>
