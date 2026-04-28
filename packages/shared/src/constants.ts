import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

export const HOME_DIR = path.join(os.homedir(), ".claude-code-router");

export const CONFIG_FILE = path.join(HOME_DIR, "config.json");
export const CONFIG_FILE_JSONC = path.join(HOME_DIR, "config.jsonc");

export const PLUGINS_DIR = path.join(HOME_DIR, "plugins");

export const PRESETS_DIR = path.join(HOME_DIR, "presets");

export const PID_FILE = path.join(HOME_DIR, '.claude-code-router.pid');

export const REFERENCE_COUNT_FILE = path.join(os.tmpdir(), "claude-code-reference-count.txt");

// Claude projects directory
export const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

// Returns the active config file path. Errors if both config.json and config.jsonc exist.
// Defaults to config.jsonc for new installs.
export const resolveConfigFile = async (): Promise<string> => {
  const [jsonExists, jsoncExists] = await Promise.all([
    fs.access(CONFIG_FILE).then(() => true).catch(() => false),
    fs.access(CONFIG_FILE_JSONC).then(() => true).catch(() => false),
  ]);
  if (jsonExists && jsoncExists) {
    throw new Error(
      `Both config.json and config.jsonc exist in ${HOME_DIR}. Remove one to continue.`
    );
  }
  if (jsonExists) return CONFIG_FILE;
  if (jsoncExists) return CONFIG_FILE_JSONC;
  return CONFIG_FILE_JSONC;
};

// Embedded content of config.example.jsonc — written verbatim on first run.
export const EXAMPLE_CONFIG_CONTENT = `// config.jsonc — copy of config.example.jsonc. Fill in your values.
// Comments are stripped at load time. API keys use $VAR or \${VAR} env-variable syntax.
{
  // Shared secret that clients must send in x-api-key or Authorization: Bearer.
  // Required when HOST is not 127.0.0.1.
  "APIKEY": "your-secret-key",
  "HOST": "0.0.0.0",
  "PORT": "3456",
  "LOG_LEVEL": "info",        // fatal | error | warn | info | debug | trace
  "API_TIMEOUT_MS": 600000,
  "NON_INTERACTIVE_MODE": false,

  // ── Providers ──────────────────────────────────────────────────────────────
  // Declare one entry per API backend. api_key values use $VAR or \${VAR} syntax
  // and are injected from environment variables at startup.
  "Providers": [
    {
      // Direct Anthropic API — preserves native request/response format.
      "name": "anthropic",
      "api_base_url": "https://api.anthropic.com/v1/messages",
      "api_key": "$ANTHROPIC_API_KEY",
      "models": [
        "claude-opus-4-7",
        "claude-sonnet-4-6",
        "claude-haiku-4-5-20251001"
      ],
      "transformer": { "use": ["anthropic"] }
    },
    {
      // OpenRouter — multi-model gateway; append :online suffix for web-search grounding
      "name": "openrouter",
      "api_base_url": "https://openrouter.ai/api/v1/chat/completions",
      "api_key": "$OPENROUTER_API_KEY",
      "models": [
        "google/gemini-2.5-pro-preview",
        "google/gemini-2.5-flash:online"
      ],
      "transformer": { "use": ["openrouter"] }
    },
    {
      // DeepSeek — strong reasoning at low cost; deepseek-reasoner for Plan Mode
      "name": "deepseek",
      "api_base_url": "https://api.deepseek.com/chat/completions",
      "api_key": "$DEEPSEEK_API_KEY",
      "models": ["deepseek-chat", "deepseek-reasoner"],
      "transformer": {
        "use": ["deepseek"],
        "deepseek-chat": { "use": ["tooluse"] }
      }
    },
    {
      // Local Ollama — free, offline, no API key required
      "name": "ollama",
      "api_base_url": "http://localhost:11434/v1/chat/completions",
      "api_key": "ollama",
      "models": ["qwen2.5-coder:latest"]
    }
  ],

  // ── Option A: single Router ─────────────────────────────────────────────────
  "Router": {
    "default":    "anthropic,claude-sonnet-4-6",
    "background": "ollama,qwen2.5-coder:latest",
    "think":      "deepseek,deepseek-reasoner",
    "longContext": "openrouter,google/gemini-2.5-pro-preview",
    "longContextThreshold": 60000,
    "webSearch":  "openrouter,google/gemini-2.5-flash:online",
    "image":      "anthropic,claude-sonnet-4-6"
  }
}
`;

export interface DefaultConfig {
  LOG: boolean;
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL: string;
}

export const DEFAULT_CONFIG: DefaultConfig = {
  LOG: false,
  OPENAI_API_KEY: "",
  OPENAI_BASE_URL: "",
  OPENAI_MODEL: "",
};
