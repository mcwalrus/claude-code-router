# Upstreaming Router-Specific Additions to mcwalrus/llms

## Summary

The local `packages/core/` workspace copy contains router-specific additions that are **not present** in the upstream `mcwalrus/llms` repository. An attempt was made to switch the monorepo from using the local workspace copy to a git submodule pointing at `mcwalrus/llms`. The build succeeded, but the router failed to compile because only `default Server` was exported — all named exports that the router depends on were missing.

## What the Submodule Build Lacks

| Import (used by router) | Location in router | Available in mcwalrus/llms@3c02467? |
|---|---|---|
| `calculateTokenCount` | `server.ts:1` | **NO** |
| `TokenizerService` | `server.ts:1` | **NO** |
| `getRouterLogBuffer` | `server.ts:1` | **NO** |
| `sessionUsageCache` | `index.ts:10` | **NO** |
| `pluginManager` | `index.ts:18` | **NO** |
| `tokenSpeedPlugin` | `index.ts:18` | **NO** |
| `metricsPlugin` | `index.ts:18` | **NO** |
| `SSEParserTransform` | `types/llms-plugin.d.ts:49` | **NO** |
| `SSESerializerTransform` | `types/llms-plugin.d.ts:54` | **NO** |
| `rewriteStream` | `types/llms-plugin.d.ts:59` | **NO** |
| `searchProjectBySession` | `types.d.ts:50` | **NO** |

The upstream build (`dist/esm/server.mjs`, `dist/cjs/server.cjs`) only exports `default Server`. All named symbols must be added upstream before any future git-submodule switch is viable.

## Router-Specific Additions in packages/core/

| File | What it adds vs upstream |
|---|---|
| `src/plugins/index.ts` | Re-exports `pluginManager`, `tokenSpeedPlugin`, `metricsPlugin`, `CCRPlugin`, `CCRPluginOptions`, `PluginMetadata` |
| `src/plugins/plugin-manager.ts` | `PluginManager` class — register, enable/disable, introspect plugins |
| `src/plugins/token-speed.ts` | `tokenSpeedPlugin`: token-speed tracking with temp-file output |
| `src/plugins/metrics.ts` | `metricsPlugin`: Prometheus `/metrics` endpoint |
| `src/plugins/output/*.ts` | Output handler framework (console, temp-file, webhook, manager, types) |
| `src/plugins/types.ts` | Interfaces: `CCRPlugin`, `CCRPluginOptions`, `PluginMetadata` |
| `src/utils/sse/*.ts` | `SSEParserTransform`, `SSESerializerTransform`, `rewriteStream` for agent tool-calling |
| `src/utils/router.ts` | `getRouterLogBuffer`, `calculateTokenCount`, `searchProjectBySession`, interactive routing |
| `src/utils/cache.ts` | `sessionUsageCache` — LRU-backed per-session usage tracking |
| `src/services/tokenizer.ts` | `TokenizerService` with tiktoken / huggingface / API backends |
| `src/tokenizer/*.ts` | Tokenizer implementations (tiktoken, huggingface, api) |

## Submodule Experiment Timeline

1. **Added submodule**: `git submodule add https://github.com/mcwalrus/llms.git packages/llms`
2. **Submodule builds**: `pnpm --filter @mcwalrus/llms build` succeeds
3. **Router fails**: esbuild reports missing named exports (`calculateTokenCount`, `TokenizerService`, etc.)
4. **Reverted submodule**: removed `packages/llms`, restored `packages/core/`
5. **Kept renames**: all packages now use `@mcwalrus/llms` consistently

## Decisions Taken

- **Keep monorepo workspace**: The current monorepo architecture is optimal for LLM-driven development. Both router and core can be modified in a single session, with atomic commits and no branch switching.
- **Name identity**: `packages/core/` is renamed to `@mcwalrus/llms` (was `@musistudio/llms`) to make it clear this is the owned fork.
- **Upstreams are reference, not dependency**: `musistudio/llms` is the original upstream. `mcwalrus/llms` is a stale personal fork. When upstream improves, cherry-pick selectively. Don't force a submodule linkage before the exports match.

## Action Items

| # | Action | Owner | Priority |
|---|---|---|---|
| 1 | Port `src/plugins/**` from router repo to `mcwalrus/llms` | `@mcwalrus` | P2 |
| 2 | Port `src/utils/sse/**` to `mcwalrus/llms` | `@mcwalrus` | P2 |
| 3 | Port `src/utils/router.ts` + `cache.ts` to `mcwalrus/llms` | `@mcwalrus` | P2 |
| 4 | Port `src/services/tokenizer.ts` + `src/tokenizer/**` to `mcwalrus/llms` | `@mcwalrus` | P2 |
| 5 | Ensure `mcwalrus/llms` build exports all named symbols | `@mcwalrus` | P2 |
| 6 | Re-evaluate git submodule after upstream parity | `@mcwalrus` | P4 |

## Notes

- The module declarations in `packages/server/src/types.d.ts` and `packages/server/src/types/llms-plugin.d.ts` serve as the contract / spec of what the upstream must provide.
- If upstream parity is reached, the git-submodule flow should work because:
  - `pnpm-workspace.yaml` includes `packages/*`
  - `package.json` uses `"@mcwalrus/llms": "workspace:*"`
  - As long as the submodule is checked out to a matching package name, pnpm resolves it.
