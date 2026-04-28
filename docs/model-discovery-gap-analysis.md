# Gap Analysis: Dynamic Model Discovery for Claude Code Router

> **Date:** 2026-04-28  
> **Scope:** `mcwalrus/claude-code-router` — CLI model selector, server routing, cost/UX pipeline  
> **Status:** Verified by code inspection

---

## Executive Summary

The Claude Code Router currently manages models through a **fully static, config-file-driven** architecture:

- The CLI (`ccr model`) reads model lists from `~/.claude-code-router/config.json`
- The server exposes no model-listing endpoint
- Cost data flows from the upstream Claude Code process (via `stdin`), not from the router

**As it stands, making the model list dynamic and cost-aware requires building new plumbing in both the server and the CLI.** Neither component currently has the necessary hooks.

---

## Verified Findings

### 1. CLI reads static config — no API calls

**Location:** `packages/cli/src/utils/modelSelector.ts:70-84`

```ts
function getConfigPath(): string { /* resolves ~/.claude-code-router/config.json */ }
function loadConfig(): Config {
  const configPath = getConfigPath();
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));  // ← fs.readFileSync, not HTTP
}
```

- `getAllModels()` at `:92-95` iterates `config.Providers[].models[]`
- The `availableModels` list is also filtered through a **hardcoded** `AVAILABLE_TRANSFORMERS` array at `:51-68`
- **No fetch/XHR/HTTP request to any server endpoint**

### 2. Server/core has no model-discovery endpoint

**Locations:**
- `packages/core/src/server.ts:144-152` — only registers `POST /v1/messages`
- `packages/core/src/api/routes.ts` — defines `/providers` CRUD but no `/v1/models`

The core `@musistudio/llms` library (opaque, in `packages/core/`) proxies chat requests to upstream providers but does not expose a model enumeration API.

### 3. Statusline receives cost from stdin, not from a server endpoint

**Location:** `packages/cli/src/utils/statusline.ts:22-56`

```ts
function parseStatusLineData(input: string): StatusLineInput {
  const data = JSON.parse(input) as StatusLineInput;
  // fields: cost.total_cost_usd, context_window.total_input_tokens, etc.
}
```

- The statusline is invoked as `ccr statusline` with JSON piped over `stdin`
- `formatCost()` and `formatUsage()` are pure local formatters
- No HTTP call to the server for pricing or model metadata

### 4. No proxy/aggregation of upstream `GET /v1/models`

Zero references to `v1/models` as a list endpoint in `/packages/server/src` or `/packages/core/src`. The only `/models` strings are action URLs inside provider transformers (e.g., `vertex-claude.transformer.ts`, `gemini.transformer.ts`).

---

## Architecture Gap

To make model listing dynamic and cost-aware **natively**, the router would need:

| Component | What's Missing |
|-----------|---------------|
| **Server** | A new endpoint (`GET /v1/models` or similar) that queries each provider's model API, aggregates results, and optionally caches them |
| **CLI** | A network path to fetch models from the server instead of reading the static `config.json` |
| **Cost metadata** | Pricing data is not standardized by any provider; each has its own format (or none at all) |

---

## How the Official Client Does It (for comparison)

| Capability | Official `@anthropic-ai/claude-code` | Router `@mcwalrus/claude-code-router` |
|---|---|---|
| Custom model selection | Yes — `settings.json` `model` field / `ANTHROPIC_MODEL` env | Yes — `config.json` `Providers[].models[]` |
| Dynamic model discovery | **No** — hardcoded `MODEL_COSTS` table in binary | **No** — static `config.json` |
| User-configurable pricing | **No** — built-in cost tiers per model family | N/A — cost comes from upstream Claude Code via `stdin` |
| Cost for unknown models | Flagged as approximate; falls back to default tier | Not tracked by router; displayed as-is from upstream |

### Key insight from the official client

The official client calculates cost in `source/src/utils/modelCost.ts` using a static lookup:

```ts
export const MODEL_COSTS: Record<ModelShortName, ModelCosts> = {
  'claude-opus-4-6': COST_TIER_5_25,
  'claude-sonnet-4-6': COST_TIER_3_15,
  // ... ~12 entries total
};
```

For unknown models, it:
1. Falls back to `DEFAULT_UNKNOWN_MODEL_COST` (`COST_TIER_5_25`)
2. Sets `hasUnknownModelCost()` state
3. Displays a warning: `costs may be inaccurate due to usage of unknown models`

---

## Why Cost Is Especially Hard for the Router

The router **does not compute cost itself**. The flow is:

```
Claude Code process → (JSON via stdin) → ccr statusline
```

The upstream process already computes cost using its own `MODEL_COSTS` table. The router only **displays** that pre-computed value. Therefore:

- **The router cannot influence cost accuracy** for custom models
- **Any change to cost display must happen upstream** in the Claude Code process, or the server must intercept and rewrite the response before it reaches the CLI
- Since the router uses multiple providers (Anthropic, Gemini, OpenRouter, etc.), pricing data from one provider's API does not map cleanly to another's cost structure

---

## Options Considered

| Approach | Feasibility | Notes |
|----------|-------------|-------|
| **A. Server-side model discovery endpoint** | Required if going native | Needs new route in `/packages/core/src/api/routes.ts`, cache invalidation logic, and per-provider adapter |
| **B. CLI fetches models from server** | Required if going native | Replace `fs.readFileSync` in `modelSelector.ts` with a fetch; needs fallback to static config |
| **C. Config-refresh sidecar** | Lower effort | A script periodically fetches model lists and rewrites `config.json`; doesn't require CLI or server changes |
| **D. Server passes model list in `/v1/messages` response** | Breaking change | Would require altering the messages proxy contract; fragile |
| **E. Upstream Claude Code handles custom model pricing** | Out of scope for router | Already has unknown-model fallback; no user-configurable pricing |

---

## Risks of Going Dynamic

1. **Cache staleness** — Provider adds or removes models; cache stale until refresh
2. **Provider heterogeneity** — Each provider has a different model-list API format and endpoint; Anthropic's `/v1/models`, OpenAI's `/v1/models`, OpenRouter's own format, etc.
3. **Cost divergence** — Listing models dynamically doesn't solve cost attribution; pricing lives in the upstream process or must be maintained separately
4. **Opaque core library dependency** — `@musistudio/llms` may eventually add discovery; building parallel plumbing risks obsolescence

---

## Recommended Next Steps

1. **Decouple scope** — Separate "dynamic model list for selection UX" from "cost/pricing display"
2. **Boundary probe** — Inspect `node_modules/@musistudio/llms` type exports for any hidden model discovery API
3. **User-pain validation** — Confirm whether `config.json` editing is actually a bottleneck for users, or whether a config-refresh sidecar is sufficient
4. **If proceeding with a design:**
   - Add a thin `GET /api/models` endpoint in `packages/core/src/api/routes.ts`
   - Add a CLI-side fetch in `packages/cli/src/utils/modelSelector.ts` with fallback to `loadConfig()`
   - Document the per-provider adapter contract

---

## Files of Record

| File | Role |
|------|------|
| `packages/cli/src/utils/modelSelector.ts` | CLI model picker — static config loading |
| `packages/cli/src/utils/statusline.ts` | Cost display — receives data via stdin |
| `packages/core/src/server.ts` | Server bootstrap — only `POST /v1/messages` |
| `packages/core/src/api/routes.ts` | API routes — no model listing endpoint |

---

*Report generated from code inspection of `mcwalrus/claude-code-router` and `@anthropic-ai/claude-code@2.1.88` (extracted source).*
