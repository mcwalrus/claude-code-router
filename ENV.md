# Environment Variables

This document lists every `CCR_` prefixed environment variable the proxy supports at runtime. Each maps to a single [config.json](README.md) key. If a variable is not set, the proxy reads its value from the JSON config file as usual (or falls back to the built-in default).

---

## Core Server Settings

| Variable | Config Key | Type | Description |
|---|---|---|---|
| `CCR_HOST` | `HOST` | `string` | Bind address. Use `0.0.0.0` to accept external connections (requires `APIKEY`). |
| `CCR_PORT` | `PORT` | `number` | TCP port. Default: `3456`. |
| `CCR_APIKEY` | `APIKEY` | `string` | Shared secret clients must send in `x-api-key` or `Authorization: Bearer` header. |
| `CCR_API_TIMEOUT_MS` | `API_TIMEOUT_MS` | `number` | Upstream LLM API timeout (ms). Default: `600000`. |
| `CCR_LOG_LEVEL` | `LOG_LEVEL` | `string` | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace`. |
| `CCR_LOG` | `LOG` | `boolean` | Enable rotating log files under `~/.claude-code-router/logs/`. |
| `CCR_NON_INTERACTIVE_MODE` | `NON_INTERACTIVE_MODE` | `boolean` | Disable stdin interaction. Useful in headless/CI pipelines. |
| `CCR_PROXY_URL` | `PROXY_URL` | `string` | HTTP proxy URL for upstream requests, e.g. `http://127.0.0.1:7890`. |
| `CCR_CUSTOM_ROUTER_PATH` | `CUSTOM_ROUTER_PATH` | `string` | Absolute path to a custom JS router function. |
| `CCR_CLAUDE_PATH` | `CLAUDE_PATH` | `string` | Path to the `claude` CLI executable. Default: `"claude"`. |

---

## Router Overrides

All model references are `"provider,model"` format.

| Variable | Config Key | Type | Description |
|---|---|---|---|
| `CCR_ROUTER_DEFAULT` | `Router.default` | `string` | Catch-all model. |
| `CCR_ROUTER_BACKGROUND` | `Router.background` | `string` | Lightweight/bgd tasks. |
| `CCR_ROUTER_THINK` | `Router.think` | `string` | Plan Mode / reasoning. |
| `CCR_ROUTER_LONG_CONTEXT` | `Router.longContext` | `string` | Large-context fallback. |
| `CCR_ROUTER_LONG_CONTEXT_THRESHOLD` | `Router.longContextThreshold` | `number` | Token count that triggers `longContext`. Default: `60000`. |
| `CCR_ROUTER_WEB_SEARCH` | `Router.webSearch` | `string` | Web-search tasks. |
| `CCR_ROUTER_IMAGE` | `Router.image` | `string` | Image-related tasks. |

---

## Plugins

| Variable | Config Key | Type | Description |
|---|---|---|---|
| `CCR_PLUGINS` | `plugins` | `JSON array` | Full plugin array. Must be valid JSON. |

### Example

```bash
CCR_PLUGINS='[{"name":"metrics","enabled":true,"options":{"port":9464}}]'
```

---

## Docker / Container

Pass variables with `-e` or `--env-file`:

```bash
# Single flags
docker run -e CCR_PORT=8080 -e CCR_HOST=0.0.0.0 -e CCR_APIKEY=sk-xxx ...

# Or via .env file
docker run --env-file .env ...
```

The Makefile `just local-proxy` target already includes `--env-file .env`.

---

## Provider API Keys

Provider-level `api_key` values inside `config.jsonc` support `$VAR` and `${VAR}` interpolation at parse time. These upstream keys are **not** read by the proxy itself — they are only consumed during preset installation or manual config editing:

| Variable | Typical Use |
|---|---|
| `ANTHROPIC_API_KEY` | `${ANTHROPIC_API_KEY}` in config |
| `OPENAI_API_KEY` | `${OPENAI_API_KEY}` in config |
| `GEMINI_API_KEY` | `${GEMINI_API_KEY}` in config |
| `TOGETHER_API_KEY` | `${TOGETHER_API_KEY}` in config |
| `OPENROUTER_API_KEY` | `${OPENROUTER_API_KEY}` in config |
| `GROQ_API_KEY` | `${GROQ_API_KEY}` in config |

---

## Notes

- **Env vars override JSON config.** If both `CCR_PORT=8080` and `"PORT": 3456` exist in `config.jsonc`, the env wins.
- **If a variable is not set**, the proxy silently falls back to config.jsonc (or the built-in default).
- **Type coercion** is automatic: `"true"` → `true`, `"8080"` → `8080`, everything else stays a string.
- **Invalid `CCR_PLUGINS` JSON** is logged to stderr and skipped.
