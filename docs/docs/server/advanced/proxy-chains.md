---
sidebar_position: 3
---

# Proxy Chains & Hop Metrics

Chain multiple Claude Code Router (CCR) instances so requests flow through several network segments (e.g. edge → DMZ → internal) while keeping **per-hop metrics** visible at every layer.

## Why Chain CCR Instances?

- **Network segmentation** — an edge instance in a DMZ reaches the public internet; an internal instance reaches a private provider.
- **Per-hop telemetry** — see token counts, latency, and routing decisions at *each* CCR, not just the final one.
- **Local caching / fallback** — edge can serve short local-context requests directly; only forward expensive ones upstream.

## Configuration

### 1. Define an Upstream CCR as a Provider

Treat another CCR instance exactly like any other provider. Use the **anthropic** transformer (or no transformer) since CCR speaks Anthropic SSE natively.

```jsonc
{
  "Providers": [
    {
      "name": "upstream-ccr",
      "api_base_url": "http://10.0.1.10:3456",
      "api_key": "${UPSTREAM_API_KEY}",
      "models": ["claude-sonnet-4-6"],
      "transformer": { "use": ["anthropic"] }
    }
  ],
  "Router": {
    "default": "upstream-ccr,claude-sonnet-4-6"
  }
}
```

> The upstream CCR still sees a normal Anthropic-format request and applies its own `Router` rules.

### 2. Label This Hop

Set `PROXY_HOP` (or `CCR_PROXY_HOP` as an env var) to identify this instance in Prometheus metrics.

```jsonc
{
  "PROXY_HOP": "edge",
  "Providers": [ /* … */ ]
}
```

**Env-var form** (useful in Docker / Kubernetes):

```bash
CCR_PROXY_HOP=edge ccr start
```

### 3. Full Chain Example

**Edge instance** (public-facing, runs in DMZ):

```jsonc
{
  "PROXY_HOP": "edge",
  "APIKEY": "edge-secret",
  "Providers": [
    {
      "name": "dmz-ccr",
      "api_base_url": "http://dmz.internal:3456",
      "api_key": "${DMZ_API_KEY}",
      "models": ["claude-sonnet-4-6"],
      "transformer": { "use": ["anthropic"] }
    }
  ],
  "Router": {
    "default": "dmz-ccr,claude-sonnet-4-6",
    "background": "ollama,qwen2.5-coder:latest"
  }
}
```

**DMZ instance** (bridges to internal VPC):

```jsonc
{
  "PROXY_HOP": "dmz",
  "APIKEY": "dmz-secret",
  "Providers": [
    {
      "name": "internal-ccr",
      "api_base_url": "http://vpc.internal:3456",
      "api_key": "${INTERNAL_API_KEY}",
      "models": ["claude-sonnet-4-6"],
      "transformer": { "use": ["anthropic"] }
    }
  ],
  "Router": {
    "default": "internal-ccr,claude-sonnet-4-6"
  }
}
```

**Internal instance** (reaches the real provider):

```jsonc
{
  "PROXY_HOP": "internal",
  "APIKEY": "internal-secret",
  "Providers": [
    {
      "name": "anthropic",
      "api_base_url": "https://api.anthropic.com",
      "api_key": "${ANTHROPIC_API_KEY}",
      "models": ["claude-sonnet-4-6"]
    }
  ],
  "Router": {
    "default": "anthropic,claude-sonnet-4-6"
  }
}
```

## What the Hop Label Does

When the **metrics plugin** is enabled, every metric that records a routing decision or token usage gains a `hop` label equal to the local `PROXY_HOP` value (default: `"local"` if unset).

Relevant metrics:

| Metric | Label added |
|---|---|
| `ccr_provider_routes_total` | `hop` |
| `ccr_tokens_total` | `hop` |

**Prometheus query examples:**

```promql
# Total requests handled by the edge instance
ccr_provider_routes_total{hop="edge"}

# Output tokens at the DMZ instance for a specific model
ccr_tokens_total{hop="dmz",model="claude-sonnet-4-6",type="output"}

# Compare latency across hops
histogram_quantile(0.95,
  rate(ccr_request_duration_seconds{hop="edge"}[5m])
)
```

## Interaction with `PROXY_URL`

- `PROXY_URL` (or `CCR_PROXY_URL`) is an **HTTP tunnel** — it wraps the TCP connection to the upstream provider (useful for corporate proxies like `http://127.0.0.1:7890`).
- `PROXY_HOP` is purely a **metrics label** — it does not change how requests are forwarded.

You can use both together:

```bash
CCR_PROXY_HOP=edge CCR_PROXY_URL=http://corp-proxy:8080 ccr start
```

Here the edge instance routes through the corporate HTTP proxy, and every metric is tagged `hop="edge"`.
