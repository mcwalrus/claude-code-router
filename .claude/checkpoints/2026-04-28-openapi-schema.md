# Session Checkpoint — 2026-04-28

## Branch
`shimmering-kindling-shamir` worktree (rebased onto `main`)

## Completed Work

### packages/shared/src/config-schema.ts (new)
- TypeBox schema for `~/.claude-code-router/config.json`
- Exports `ConfigSchema`, `Config` type, `validateConfig()`

### packages/shared/src/index.ts
- Re-exports config-schema

### packages/server/src/server.ts
- Registers `@fastify/swagger` + `@fastify/swagger-ui` (path: `CCR_DOCS_PATH` env, default `/documentation`)
- `GET /api/config/schema` — returns raw JSON Schema for AI agent use
- `GET /api/config` — response schema simplified to `{type: "object", additionalProperties: true}`
- `POST /api/config` — body schema simplified to `{type: "object", additionalProperties: true}`

### packages/server/src/middleware/auth.ts
- Docs path bypasses API key auth

### packages/server/src/index.ts
- Optional Basic auth for docs endpoint (`CCR_DOCS_AUTH`, `CCR_DOCS_USER`, `CCR_DOCS_PASSWORD`)
- Soft config validation on load (logs warnings, does not crash)

### packages/server/goss.yaml (new)
- Container tests: `/health`, `/api/config/schema`, `/documentation`, `/documentation/json`, port 3456, node process, log dir, dist file

### scripts/test-docker.sh (new)
- Downloads Linux goss binary (arm64/amd64) to `.goss-cache/`
- Builds UI if missing, builds Docker image, runs `dgoss run`
- `GOSS_SLEEP=35` (server needs time to start)

### .gitignore
- Added `.goss-cache/`

---

## Current Blocker

Server crashes in PM2 restart loop inside Docker (exit code 1).
The real error is swallowed — Fastify's `start()` catch block writes to pino's
rotating file stream, which only shows `register transformer: Anthropic` before dying.

**Suspected cause:** `@fastify/swagger` or `@fastify/swagger-ui` plugin registration
throws during `app.ready()` (called internally by `app.listen()`).

---

## Next Step

Force pino to stdout (set `LOG: false` in the container config or patch `loggerConfig`)
so the real error surfaces, then fix root cause.

---

## Uncommitted Changes at Time of Checkpoint
- `scripts/test-docker.sh` — GOSS_SLEEP=35 + Linux binary fix
- `packages/server/src/server.ts` — POST /api/config schema simplification
