/**
 * Flat env var overrides for CCR config.
 *
 * Only these specific CCR_* variables are supported.
 * If you need something not listed, add it to config.jsonc.
 *
 *   CCR_PORT=8080     -> config.PORT = 8080
 *   CCR_HOST=0.0.0.0  -> config.HOST = "0.0.0.0"
 *   CCR_APIKEY=secret -> config.APIKEY = "secret"
 *   CCR_LOG_LEVEL=info -> config.LOG_LEVEL = "info"
 *   CCR_PLUGINS='[{"name":"metrics","enabled":true}]'
 *                  -> config.plugins = [...]
 */

export interface EnvConfigOptions {
  env?: Record<string, string | undefined>;
}

/**
 * Parse the known flat CCR_* env vars into a minimal config object.
 * If a var is not set, the key is omitted.
 */
export function loadEnvConfig(options: EnvConfigOptions = {}): Record<string, any> {
  const env = options.env || (typeof process !== "undefined" ? process.env : {});
  const result: Record<string, any> = {};

  const s = (k: string) => env[k];

  const num = (k: string): number | undefined => {
    const v = s(k);
    if (v === undefined) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const bool = (k: string): boolean | undefined => {
    const v = s(k);
    if (v === undefined) return undefined;
    const lower = v.toLowerCase();
    if (lower === "true" || lower === "1" || lower === "yes" || lower === "on") return true;
    if (lower === "false" || lower === "0" || lower === "no" || lower === "off") return false;
    return undefined;
  };

  const str = (k: string): string | undefined => s(k);

  const json = (k: string): any | undefined => {
    const v = s(k);
    if (v === undefined) return undefined;
    try {
      return JSON.parse(v);
    } catch {
      console.warn(`[env-config] ${k} is not valid JSON, ignoring`);
      return undefined;
    }
  };

  if (num("CCR_PORT") !== undefined) result.PORT = num("CCR_PORT");
  if (str("CCR_HOST") !== undefined) result.HOST = str("CCR_HOST");
  if (str("CCR_APIKEY") !== undefined) result.APIKEY = str("CCR_APIKEY");
  if (num("CCR_API_TIMEOUT_MS") !== undefined) result.API_TIMEOUT_MS = num("CCR_API_TIMEOUT_MS");
  if (str("CCR_LOG_LEVEL") !== undefined) result.LOG_LEVEL = str("CCR_LOG_LEVEL");
  if (bool("CCR_LOG") !== undefined) result.LOG = bool("CCR_LOG");
  if (bool("CCR_NON_INTERACTIVE_MODE") !== undefined) result.NON_INTERACTIVE_MODE = bool("CCR_NON_INTERACTIVE_MODE");
  if (str("CCR_CUSTOM_ROUTER_PATH") !== undefined) result.CUSTOM_ROUTER_PATH = str("CCR_CUSTOM_ROUTER_PATH");
  if (str("CCR_CLAUDE_PATH") !== undefined) result.CLAUDE_PATH = str("CCR_CLAUDE_PATH");
  if (str("CCR_PROXY_URL") !== undefined) result.PROXY_URL = str("CCR_PROXY_URL");

  const routerDefault = str("CCR_ROUTER_DEFAULT");
  const routerThink = str("CCR_ROUTER_THINK");
  const routerBackground = str("CCR_ROUTER_BACKGROUND");
  const routerLongContext = str("CCR_ROUTER_LONG_CONTEXT");
  const routerWebSearch = str("CCR_ROUTER_WEB_SEARCH");
  const routerImage = str("CCR_ROUTER_IMAGE");
  const routerLongContextThreshold = num("CCR_ROUTER_LONG_CONTEXT_THRESHOLD");

  if (
    routerDefault !== undefined ||
    routerThink !== undefined ||
    routerBackground !== undefined ||
    routerLongContext !== undefined ||
    routerWebSearch !== undefined ||
    routerImage !== undefined ||
    routerLongContextThreshold !== undefined
  ) {
    result.Router = {};
    if (routerDefault !== undefined) result.Router.default = routerDefault;
    if (routerThink !== undefined) result.Router.think = routerThink;
    if (routerBackground !== undefined) result.Router.background = routerBackground;
    if (routerLongContext !== undefined) result.Router.longContext = routerLongContext;
    if (routerWebSearch !== undefined) result.Router.webSearch = routerWebSearch;
    if (routerImage !== undefined) result.Router.image = routerImage;
    if (routerLongContextThreshold !== undefined) result.Router.longContextThreshold = routerLongContextThreshold;
  }

  const plugins = json("CCR_PLUGINS");
  if (plugins !== undefined) {
    result.plugins = plugins;
  }

  return result;
}
