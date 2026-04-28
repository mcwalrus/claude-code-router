---
sidebar_position: 2
---

# Model Suggestions Engine (Experimental)

> Status: **Design Proposal** — Not yet implemented. This document describes a speculative feature for future development.

## Overview

The Model Suggestions Engine is a predictive routing layer that sits on top of CCR's existing scenario detection. Instead of presenting a flat list of models in interactive mode, the engine **ranks and recommends** models based on the detected scenario, estimated token count, and per-model capability profiles.

It can also be paired with a `BID_STRATEGY` concept (cost, speed, quality weights) for automatic selection without user intervention.

## Problem

When interactive routing mode pauses a session for model selection, the user sees a raw list of `provider,model` strings. There is no guidance on which model fits the detected scenario best. A user with 10+ configured models must manually reason about:

- Is this a reasoning-heavy task? (use `think` model)
- Is this a web search task? (use `webSearch` model)
- Is the context window huge? (use `longContext` model)
- Which of my 3 "think" models is actually best?

## Proposed Solution

### Phase 1: Capability Profiles

Extend each model in config with an optional capability profile:

```jsonc
{
  "Providers": [
    {
      "name": "openrouter",
      "models": [
        {
          "name": "anthropic/claude-sonnet-4",
          "capabilities": {
            "reasoning": 0.9,
            "coding": 0.95,
            "contextWindow": 200000,
            "speed": 0.7,
            "costRank": 3
          }
        },
        {
          "name": "deepseek/deepseek-r1",
          "capabilities": {
            "reasoning": 0.95,
            "coding": 0.85,
            "contextWindow": 128000,
            "speed": 0.5,
            "costRank": 1
          }
        }
      ]
    }
  ]
}
```

Capabilities are **optional** and **purely advisory**. If absent, the engine falls back to the existing router rules (default/think/background/etc.) with no ranking.

### Phase 2: Scenario-to-Capability Mapping

The router's existing `getUseModel` already detects scenarios:

| Scenario | Detected By | Priority Capability |
|---|---|---|
| `think` | `req.body.thinking` present | `reasoning` |
| `webSearch` | Tool with `type: "web_search"` | `webSearch` |
| `longContext` | `tokenCount > threshold` | `contextWindow` |
| `background` | Claude Haiku model | `speed` |
| `interactive` | First request in session | — (user must choose) |
| `default` | None of the above | Balanced |

The suggestion engine maps each scenario to a **priority capability**, then ranks configured models by that capability score.

### Phase 3: Suggestion API

New endpoint:

```
GET /api/interactive/suggest/:sessionId
```

Response:

```json
{
  "sessionId": "abc123",
  "scenario": "think",
  "tokenCount": 4500,
  "suggestions": [
    {
      "rank": 1,
      "model": "openrouter,deepseek/deepseek-r1",
      "reason": "Highest reasoning score (0.95) for think scenario",
      "scenarioMatch": "think"
    },
    {
      "rank": 2,
      "model": "openrouter,anthropic/claude-sonnet-4",
      "reason": "Strong reasoning (0.90), faster than R1",
      "scenarioMatch": "think"
    }
  ]
}
```

If no capability profiles are configured, the endpoint returns an empty `suggestions` array and falls back to the raw model list.

### Phase 4: BID_STRATEGY (Auto-Selection)

When `BID_STRATEGY` is set (env var or config), suggestions turn into **automatic selections** without user intervention:

```bash
export CCR_BID_STRATEGY="quality:0.6,cost:0.3,speed:0.1"
```

The engine computes a **composite score** per model:

```
score = quality * reasoningScore + cost * (1/costRank) + speed * speedScore
```

Highest score wins. This transforms interactive mode from "pause and ask" to "auto-pick with audit trail."

### Phase 5: UI Integration

In the web UI's interactive mode dialog:

- **Recommended** tab (default): Shows 3 top suggestions with scenario badge and reasoning
- **All Models** tab: Fallback to flat list
- **Bid Preview**: When BID_STRATEGY is active, show the computed score breakdown

## Key Design Decisions

1. **Capabilities are optional** — No breaking config changes. Existing setups work unchanged.
2. **Profiles are local** — No external API calls. All inference is deterministic from config.
3. **Scores are relative** — Within the configured provider set, not absolute benchmarks.
4. **Bid strategy is additive** — It only activates when explicitly configured.

## Relation to BID_STRATEGY and Auto-Negotiate

`BID_STRATEGY` is a **local, simplified version** of the more ambitious [Auto-Negotiate](#future-directions) idea. The difference:

| | BID_STRATEGY (this doc) | Auto-Negotiate (speculative) |
|---|---|---|
| **Data source** | Static capability profiles in config | Live provider API responses |
| **Scope** | Single provider's model list | All configured providers |
| **Latency** | Zero (purely local) | Adds 50-200ms per bid round |
| **Fallback** | Hardcoded defaults from config | Next-best bid wins |

They share the same scoring surface but differ in data freshness. BID_STRATEGY is the right *experimental* starting point because it requires zero infrastructure changes.

When BID_STRATEGY is active, the interactive endpoint can skip the user entirely:

```
POST /v1/messages (first request in session)
  → router detects scenario
  → suggestion engine ranks models
  → BID_STRATEGY auto-picks winner
  → req.body.model = winner
  → No UI pause needed
```

This makes `interactive + BID_STRATEGY` essentially **auto-routing with auditability** — every choice is logged but no human is blocked.

## Open Questions

- Should capability profiles be shareable via presets?
- How do we handle models with no capability profile in a BID_STRATEGY context?
- Should the engine learn from user choices over time (local preference matrix)?
- Should BID_STRATEGY support per-scenario overrides (e.g., `think: quality=1.0, cost=0.0`)?

## Related Concepts

- **Auto-Negotiate** (speculative): Full provider bidding with live latency/cost estimates
- **Model A/B Arena**: Empirical results could feed back into capability profiles
- **Session Replay**: Replay files could include the suggestion list and chosen model for analysis

## Implementation Sketch

```typescript
// packages/core/src/utils/suggestions.ts

interface CapabilityProfile {
  reasoning?: number;     // 0.0–1.0
  coding?: number;
  webSearch?: number;
  contextWindow?: number; // tokens
  speed?: number;         // 0.0–1.0 (higher = faster)
  costRank?: number;      // 1 = cheapest
}

interface Suggestion {
  rank: number;
  model: string;
  reason: string;
  compositeScore?: number;
}

function suggestModels(
  scenario: RouterScenarioType,
  models: Array<{ name: string; provider: string; capabilities?: CapabilityProfile }>,
  bidStrategy?: { quality: number; cost: number; speed: number }
): Suggestion[] {
  const scenarioCapability: Record<RouterScenarioType, keyof CapabilityProfile> = {
    think: 'reasoning',
    webSearch: 'webSearch',
    longContext: 'contextWindow',
    background: 'speed',
    default: 'reasoning',
    interactive: 'reasoning', // fallback during detection phase
  };

  const priority = scenarioCapability[scenario];

  const scored = models.map((m) => {
    const cap = m.capabilities || {};
    const primary = cap[priority] ?? 0.5;

    let score = primary;
    if (bidStrategy) {
      const quality = cap.reasoning ?? 0.5;
      const cost = cap.costRank ? 1 / cap.costRank : 0.5;
      const speed = cap.speed ?? 0.5;
      score =
        bidStrategy.quality * quality +
        bidStrategy.cost * cost +
        bidStrategy.speed * speed;
    }

    return {
      model: `${m.provider},${m.name}`,
      score,
      reason: `Top ${priority} score (${primary}) for ${scenario}`,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.map((s, i) => ({
    rank: i + 1,
    model: s.model,
    reason: s.reason,
    compositeScore: bidStrategy ? s.score : undefined,
  }));
}
```

## Future Directions

- **Crowdsourced profiles**: A community-maintained JSON file of model capabilities, fetched on first install.
- **Empirical scoring**: Track actual latency and cost per model per scenario, update profiles automatically.
- **Multi-objective Pareto frontier**: Instead of a single ranked list, show the Pareto-optimal set for cost vs quality tradeoffs.
