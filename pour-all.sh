#!/usr/bin/env bash
# Pour all 40 ccr-e2e molecules into beads
# Run from /Users/max.collier/Projects/Max/sandbox/claude-code-router

set -e

export BEADS_DIR=/Users/max.collier/Projects/Max/sandbox/claude-code-router/.beads

pour() {
  local title="$1"
  local task="$2"
  local category="$3"
  bd mol pour choo-choo-ralph \
    --var title="$title" \
    --var task="$task" \
    --var category="$category" \
    --var auto_discovery="false" \
    --var auto_learnings="false" \
    --assignee ralph
}

# ============================================================
# GROUP 1: ccr-hop-proxy-config (functional) — 8 tasks
# ============================================================

pour "Add PROXY_HOP gascity example to config.example.jsonc" \
"Update config.example.jsonc with a \"Hop Proxy — Gascity\" example block showing:
- PROXY_HOP: \"gascity\" on the inner container CCR
- Target provider: anthropic,claude-sonnet-4.6
- Outer (host) CCR configured with same providers but no hop
- Comment explaining the hop chain: gascity CCR (docker port 3456) forwards to host CCR (host.docker.internal:3456) which routes upstream.
Test steps:
1. ccr start with the hop config loads without errors
2. Config parser accepts the PROXY_HOP field" \
"functional"

pour "Document hop chain topology in docs/hop-proxy-gascity.md" \
"Create docs/hop-proxy-gascity.md explaining the full hop-proxy chain topology:
- Host: Claude Code → http://127.0.0.1:3457 (gascity CCR, mapped 127.0.0.1:3457:3456)
- Docker internal: gascity CCR → http://host.docker.internal:3456 (local host CCR)
- Local CCR → upstream provider (Anthropic, etc.)
- Include port mapping diagram and network flow description.
Test steps:
1. Doc renders correctly in markdown viewer
2. All hostnames and ports match the actual runner setup" \
"functional"

pour "Validate PROXY_HOP config loading in server startup" \
"Ensure packages/server startup code loads and validates PROXY_HOP from config.
If PROXY_HOP is set, log an info message showing the hop name at boot.
If PROXY_HOP is set but the target provider is missing, emit a clear validation error.
Test steps:
1. Start server with PROXY_HOP=gascity, observe startup log includes hop=gascity
2. Start server with PROXY_HOP set but missing provider, observe validation error" \
"functional"

pour "Add hop-proxy chain integration test" \
"Write an integration/e2e test that exercises the full hop chain:
1. Start local CCR on host port 3456 (no hop)
2. Start gascity-hop CCR in Docker on port 3457 with PROXY_HOP=gascity targeting host:3456
3. Send a test request to http://127.0.0.1:3457
4. Assert the request reaches the host CCR with hop header/label = gascity
5. Assert the host CCR forwards upstream and returns a response.
Use docker compose or testcontainers for the hop CCR.
Test steps:
1. Run test script, all assertions pass
2. Cleanup removes any spawned containers" \
"functional"

pour "Verify host.docker.internal resolution for Docker-to-host routing" \
"Verify that host.docker.internal resolves correctly from inside the CCR Docker container to the host machine.
Document any platform-specific behavior (macOS Docker Desktop vs Linux).
If host.docker.internal is not available, add a fallback to the Docker gateway IP.
Add a helper script or note in the hop-proxy docs.
Test steps:
1. docker run --rm alpine ping -c 1 host.docker.internal exits 0
2. From inside CCR container, curl http://host.docker.internal:3456/health returns 200" \
"functional"

pour "Add CLI validation for hop-proxy configuration schema" \
"Extend packages/cli config validation to check hop-proxy related fields:
- If PROXY_HOP is set, warn if the hop target URL is not resolvable
- Validate that the provider referenced by the hop exists in Providers list
- Ensure PROXY_HOP is a non-empty string.
Add unit tests for the new validation rules.
Test steps:
1. ccr start with invalid hop config emits validation error
2. ccr start with valid hop config passes validation silently" \
"functional"

pour "Document environment variable pattern for hop chains" \
"Add a section to README (or docs/) describing how to set environment variables for hop chains:
- ANTHROPIC_BASE_URL=http://host.docker.internal:3456 (set inside the gascity container)
- PROXY_HOP=gascity inside the gascity CCR config
- HOST CCR runs normally without PROXY_HOP
Include an example shell snippet and docker run -e flags.
Test steps:
1. Exported env vars produce a working hop chain
2. Doc is readable and accurate" \
"functional"

pour "Create hop-proxy debug logging for request tracing" \
"Add debug-level log entries in packages/server to trace requests through the hop chain:
- Log on entry with hop name and original request URL
- Log at each routing decision (which provider is selected)
- Log when forwarding to the next hop or to upstream
- Use pino child loggers or a trace_id to correlate hop spans.
Enable via LOG_LEVEL=debug or a TRACE_HOP env var.
Test steps:
1. Run with LOG_LEVEL=debug, logs contain hop=gascity and traceable request flow
2. Run with LOG_LEVEL=info, hop trace logs are suppressed" \
"functional"

# ============================================================
# GROUP 2: ccr-docker-compose (infrastructure) — 8 tasks
# ============================================================

pour "Create docker-compose.yml with ccr, prometheus, and otel services" \
"Create docker-compose.yml at repo root:
- ccr service: build from packages/server/Dockerfile, expose 3456 (proxy) and 9464 (metrics)
- prometheus service: official image, expose 9090, mount docker/prometheus.yml
- otel-collector service (optional): official collector, expose 4317/4318, mount docker/otel-config.yml
- ccr-local service for hop-proxy testing: mount host config, use host.docker.internal, expose 3456
- Define a shared network named ccr-gascity that mirrors the runner's network setup.
Test steps:
1. docker compose config validates without errors
2. docker compose up -d starts all expected services" \
"infrastructure"

pour "Create docker/prometheus.yml scrape config for CCR metrics" \
"Create docker/prometheus.yml configuring Prometheus to scrape:
- job_name: ccr, target: ccr:9464, scrape_interval: 15s
- Add labels: service=ccr, env=gascity-test
- Include a health-check-based relabel rule if needed.
Test steps:
1. docker compose up -d prometheus
2. curl http://localhost:9090/api/v1/targets shows ccr:9464 as UP after CCR starts" \
"infrastructure"

pour "Create docker/otel-config.yml for optional trace validation" \
"Create docker/otel-config.yml with:
- Receivers: otlp (grpc on 4317, http on 4318)
- Processors: batch
- Exporters: logging (stdout) and optionally prometheusremotewrite
- Service pipelines: traces (otlp → batch → logging), metrics (otlp → batch → logging)
Keep it minimal so the collector starts without external backends.
Test steps:
1. docker compose up -d otel-collector
2. otel-collector container logs show \"Everything is ready\" or similar ready state" \
"infrastructure"

pour "Add ccr-local service for hop-proxy with host.docker.internal routing" \
"In docker-compose.yml, add a ccr-local service:
- Uses host.docker.internal to reach the host CCR (for hop tests)
- Mounts a test config with PROXY_HOP=gascity pointing to host CCR
- Exposes port 3457 externally mapped to 3456 internally
- Depends on ccr service being healthy.
Test steps:
1. docker compose up -d ccr-local
2. curl http://localhost:3457/health returns 200 via host CCR hop" \
"infrastructure"

pour "Configure Docker network matching gascity-runner compose" \
"Ensure docker-compose.yml uses a network named ccr-gascity (or gascity-runner equivalent):
- Driver: bridge
- Subnet: 172.20.0.0/16 (or match runner)
- Attach ccr, prometheus, otel-collector, and ccr-local to it
- Document the network topology and why it matches the runner stack.
Test steps:
1. docker network ls shows ccr-gascity
2. Containers can ping each other by service name on the network" \
"infrastructure"

pour "Add docker compose healthchecks for ccr and prometheus" \
"Add healthcheck blocks:
- ccr: test curl -f http://localhost:3456/health, interval 10s, timeout 5s, retries 3
- prometheus: test wget -qO- http://localhost:9090/-/healthy, interval 10s, timeout 5s, retries 3
Ensure docker compose ps shows healthy status before just stack-up completes.
Test steps:
1. docker compose up -d
2. docker compose ps shows all services healthy after ~30s" \
"infrastructure"

pour "Add .dockerignore and docker build optimization" \
"Create .dockerignore at repo root:
- Ignore node_modules, .git, .beads, .claude, dist, *.log, .env
- Keep packages/*/src and config files for multi-stage build
Add notes to docker/README.md about layer caching and build args.
Test steps:
1. docker build -f packages/server/Dockerfile . completes without copying ignored files
2. Re-build is fast when only source code changes" \
"infrastructure"

pour "Create docker/README.md documenting stack services and ports" \
"Create docker/README.md with:
- Table of services, ports, and descriptions
- How to start the full stack
- How to run hop-proxy tests against the stack
- Troubleshooting section for common docker issues (network, volume, port collisions)
Test steps:
1. README renders correctly
2. Copy-paste commands from README start the stack successfully" \
"infrastructure"

# ============================================================
# GROUP 3: ccr-metrics-verify (functional) — 8 tasks
# ============================================================

pour "Verify metrics.ts hop label uses config.PROXY_HOP or default" \
"Inspect packages/core/src/plugins/metrics.ts:
- Confirm counter ccr_provider_routes_total labels include hop
- Confirm counter ccr_tokens_total labels include hop
- Confirm the hop label value is set from config.PROXY_HOP || \"default\"
If any deviation, open a fix PR in the mcwalrus/llms dependency (do not edit local git dep).
Test steps:
1. Code review confirms label assignment matches spec
2. Unit test confirms fallback to default when PROXY_HOP is unset" \
"functional"

pour "Write e2e test sending request through hop chain and scraping metrics" \
"Write an e2e test (packages/server test or top-level e2e folder):
1. Start host CCR and hop CCR in Docker
2. Send a request through the hop CCR
3. Scrape http://localhost:9464/metrics
4. Parse Prometheus text to find ccr_provider_routes_total and ccr_tokens_total
5. Assert hop=gascity label exists and counters > 0.
Use vitest or plain node test runner.
Test steps:
1. npm run test:e2e-metrics passes
2. Test cleans up containers after run" \
"functional"

pour "Assert ccr_provider_routes_total{hop=gascity} increments after hop request" \
"In the metrics e2e test, specifically assert:
- Before request: scrape metrics, record ccr_provider_routes_total{hop=\"gascity\"} value
- After request: scrape again, assert counter increased by 1
- If the counter is missing, fail the test with clear message.
Document this assertion as a critical test for hop-proxy correctness.
Test steps:
1. Run test, counter increases exactly as expected
2. If PROXY_HOP config is missing, test fails with actionable error" \
"functional"

pour "Verify ccr_tokens_total includes hop label with correct value" \
"In the same e2e test, assert:
- ccr_tokens_total{hop=\"gascity\"} exists after a request
- The token count is a non-negative number
- If multiple providers are used, each hop/provider combination has its own counter.
Document expected labels in docs/metrics-reference.md.
Test steps:
1. After a chat completion request, scrape shows ccr_tokens_total with hop label
2. The numeric value is > 0" \
"functional"

pour "Add metrics validation test to vitest suite" \
"If the project uses vitest, add or update a test file (e.g., packages/server/test/metrics.e2e.test.ts):
- Import prom-client from metrics plugin
- Mock config with PROXY_HOP=gascity
- Trigger a route and assert metrics output includes hop label
- Run as part of pnpm test or a dedicated test:metrics script.
Test steps:
1. pnpm test:metrics passes
2. CI includes the new test script" \
"functional"

pour "Verify Prometheus metrics text format on port 9464 in hop mode" \
"Manually or via automated test, verify:
- When PROXY_HOP=gascity is active, GET http://localhost:9464/metrics returns valid Prometheus text
- Content-Type is text/plain; version=0.0.4
- No duplicate TYPE or HELP lines
- hop label values do not contain spaces or special chars.
Test steps:
1. curl -s http://localhost:9464/metrics | grep -E '^# TYPE|^# HELP' | sort | uniq -d is empty
2. curl -I http://localhost:9464/metrics shows correct Content-Type" \
"functional"

pour "Document metrics labels and meanings in docs/metrics-reference.md" \
"Create docs/metrics-reference.md with:
- Table of exposed metrics (name, type, labels, description)
- Explanation of hop label and its values
- Example Prometheus query: rate(ccr_provider_routes_total{hop=\"gascity\"}[1m])
- Instructions on how to scrape from Docker.
Test steps:
1. Doc is consistent with actual metrics plugin output
2. Example queries run successfully against a local Prometheus" \
"functional"

pour "Add metrics endpoint integration test with health check" \
"Add a lightweight integration test:
1. Start the CCR server (or just the metrics HTTP server)
2. GET /metrics returns 200
3. GET /health returns 200
4. Both endpoints respond within 2 seconds.
This can be a fast smoke test in CI.
Test steps:
1. pnpm test:smoke-metrics passes
2. Test runs in < 10 seconds" \
"functional"

# ============================================================
# GROUP 4: ccr-worktree-agent (functional) — 8 tasks
# ============================================================

pour "Add just agent-dev <worktree-dir> target for per-agent CCR" \
"Extend justfile with agent-dev <worktree-dir> target:
- Detect if the worktree directory contains a .claude dir (agent context marker)
- Find a free port on the host (e.g., 4000+ range, check netstat/lsof)
- docker run --rm -d -p HOST_PORT:3456 -p METRICS_PORT:9464 --name ccr-agent-<dirname>
- Mount worktree's .claude/settings.json as per-agent config
- Mount the repo root for source access if needed
- Print the assigned port and container name.
Test steps:
1. just agent-dev /tmp/agent-wt-1 starts a container on a free port
2. curl http://localhost:ASSIGNED_PORT/health returns 200" \
"functional"

pour "Add just agent-list target to list all running agent CCR containers" \
"Add just agent-list target:
- docker ps --filter name=ccr-agent- --format table
- Show columns: NAME, PORT (mapped 3456), STATUS, CREATED
- If no agents running, print a friendly message.
Test steps:
1. Run agent-list after starting two agents, both appear
2. Run agent-list with no agents, prints 'No agent containers running'" \
"functional"

pour "Add just agent-stop <name> target to stop a specific agent" \
"Add just agent-stop <name> target:
- docker stop <name> && docker rm <name>
- If name is omitted, print usage and list running agents
- If name is not found, print error and list running agents
- Accept either full name (ccr-agent-<dirname>) or just <dirname>.
Test steps:
1. just agent-stop ccr-agent-agent-wt-1 stops and removes the container
2. just agent-stop nonexistent prints error and lists agents" \
"functional"

pour "Implement unique port assignment for agent containers" \
"In the agent-dev just target, implement dynamic port selection:
- Starting range: 4000
- Check each port with lsof -i :PORT or ss -tlnp until a free one is found
- Assign both proxy port (PORT) and metrics port (PORT+100) to keep them paired
- Store assigned port in a small state file (.beads/agent-ports.json) or just rely on docker ps.
Test steps:
1. Start 3 agents, each gets a unique proxy + metrics port pair
2. No port collisions occur" \
"functional"

pour "Mount worktree .claude/settings.json as per-agent config" \
"Ensure agent-dev target mounts:
- -v <worktree-dir>/.claude/settings.json:/app/.claude/settings.json:ro
- If the file does not exist, print a warning but still start the container with default config
- Document where the per-agent config is read from.
Test steps:
1. Agent container starts and respects mounted settings.json
2. If settings.json is missing, container starts with default config and logs a warning" \
"functional"

pour "Name containers ccr-agent-<dirname> to avoid collisions" \
"Ensure agent-dev target names containers using the basename of the worktree directory:
- Sanitize dirname: replace spaces/slashes with dashes, lowercase
- Check if a container with that name already exists; if so, append -2, -3, etc.
- Store the chosen name in the state file if used.
Test steps:
1. just agent-dev /tmp/my-agent creates container ccr-agent-my-agent
2. Running again with same dir creates ccr-agent-my-agent-2" \
"functional"

pour "Add agent-metrics target to scrape per-agent metrics endpoint" \
"Add just agent-metrics <name> target:
- Look up the metrics port for the named agent container
- curl -s http://localhost:METRICS_PORT/metrics
- Print a summary or pipe to stdout
- If no name given, dump metrics for all running agents.
Test steps:
1. just agent-metrics ccr-agent-my-agent returns Prometheus text
2. Metrics include the correct hop label if PROXY_HOP was set in agent config" \
"functional"

pour "Add agent-logs target for streaming agent container logs" \
"Add just agent-logs <name> target:
- docker logs -f <name>
- If no name given, print usage and list running agents
- Add alias just agent-logs-all to tail all agent containers.
Test steps:
1. just agent-logs ccr-agent-my-agent streams CCR logs
2. Ctrl+C stops the stream cleanly" \
"functional"

# ============================================================
# GROUP 5: ccr-just-stack (infrastructure) — 8 tasks
# ============================================================

pour "Add just stack-up target: docker compose up + health checks + URLs" \
"Extend justfile with stack-up target:
1. docker compose up -d
2. Wait loop: poll CCR /health (http://localhost:3456/health) until 200 or timeout 60s
3. Wait loop: poll Prometheus /graph (http://localhost:9090/graph) until 200 or timeout 60s
4. Print success message with URLs:
   - CCR Proxy: http://localhost:3456
   - Prometheus: http://localhost:9090
   - CCR Metrics: http://localhost:9464/metrics
If any health check fails, print error and run docker compose logs ccr.
Test steps:
1. just stack-up exits 0 and prints all reachable URLs
2. If CCR fails, prints CCR logs for debugging" \
"infrastructure"

pour "Add just stack-down target: docker compose down with volume cleanup" \
"Extend justfile with stack-down target:
1. docker compose down --remove-orphans
2. Optionally remove named volumes: docker compose down -v (with confirmation or a flag)
3. Print confirmation of stopped services
4. Add a --volumes flag variant: just stack-down-volumes.
Test steps:
1. just stack-down removes all compose services
2. docker ps shows no ccr, prometheus, or otel containers" \
"infrastructure"

pour "Add just stack-logs target: docker compose logs -f ccr" \
"Extend justfile with stack-logs target:
- docker compose logs -f ccr
- Optionally accept a service argument (default ccr): just stack-logs [service]
- Gracefully handle Ctrl+C.
Test steps:
1. just stack-logs streams CCR container logs
2. just stack-logs prometheus streams prometheus logs" \
"infrastructure"

pour "Add just stack-metrics target: curl localhost:9464/metrics" \
"Extend justfile with stack-metrics target:
- curl -s http://localhost:9464/metrics
- If curl fails, print a helpful message suggesting that stack-up may not be running
- Optionally pipe through head -50 for brevity.
Test steps:
1. just stack-metrics returns valid Prometheus text when stack is up
2. Prints helpful error when stack is down" \
"infrastructure"

pour "Add just stack-status target: show running services and health" \
"Extend justfile with stack-status target:
- docker compose ps --format table
- For each service, try curl -fsS health endpoint and print UP or DOWN
- Print quick summary: N services running, M healthy.
Test steps:
1. just stack-status shows all services and their states
2. After stack-down, shows 0 services running" \
"infrastructure"

pour "Add just stack-build target: rebuild CCR Docker image before up" \
"Extend justfile with stack-build target:
- docker compose build ccr
- Use --no-cache flag if requested: just stack-build --no-cache
- Print build duration
- Optionally tag the image with git sha.
Test steps:
1. just stack-build rebuilds packages/server/Dockerfile
2. docker images shows a fresh ccr image" \
"infrastructure"

pour "Add just stack-restart target: restart full stack gracefully" \
"Extend justfile with stack-restart target:
1. just stack-down (or docker compose down)
2. just stack-build (optional, controlled by a flag)
3. just stack-up
- Print restart duration
- Accept flags: --build (rebuild first), --no-build (default).
Test steps:
1. just stack-restart brings the stack down and back up
2. With --build flag, rebuilds image before restart" \
"infrastructure"

pour "Add just stack-test target: run integration tests against stack" \
"Extend justfile with stack-test target:
1. Ensure stack-up has run (or print error)
2. Run the metrics e2e test (from GROUP 3)
3. Run the hop-proxy integration test (from GROUP 1)
4. Print pass/fail summary
5. On failure, suggest docker compose logs.
Test steps:
1. just stack-test passes when stack is up and tests pass
2. just stack-test fails gracefully when stack is down" \
"infrastructure"
