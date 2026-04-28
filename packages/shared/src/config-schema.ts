import { Type, Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

// Transformer entry: bare name string or [name, optionsObject] pair
const TransformerEntry = Type.Union([
  Type.String({ description: "Transformer name" }),
  Type.Array(Type.Any(), {
    minItems: 1,
    maxItems: 2,
    description: 'Named transformer with options: ["name", { ...options }]',
  }),
]);

// Per-provider transformer config.
// `use` defines the global pipeline; additional keys are model names for per-model overrides.
const TransformerConfig = Type.Object(
  { use: Type.Optional(Type.Array(TransformerEntry)) },
  {
    additionalProperties: true,
    description:
      "Transformer pipeline. Extra keys are model names for per-model overrides.",
  }
);

const ProviderSchema = Type.Object(
  {
    name: Type.Optional(Type.String({
      description:
        'Unique provider identifier used in routing references (e.g. "openrouter")',
    })),
    api_base_url: Type.Optional(Type.String({
      description: "Full API endpoint URL for this provider",
    })),
    api_key: Type.Optional(Type.String({
      description:
        'API authentication key. Supports $VAR and ${VAR} env-variable interpolation.',
    })),
    models: Type.Optional(Type.Array(Type.String(), {
      minItems: 1,
      description: "Model names available at this provider",
    })),
    transformer: Type.Optional(TransformerConfig),
    tokenizer: Type.Optional(
      Type.Object(
        {},
        { additionalProperties: true, description: "Custom tokenizer config" }
      )
    ),
  },
  { additionalProperties: true }
);

// Routing values must be "provider,model" — comma-separated
const RouterModelRef = Type.String({
  pattern: "^[^,]+,[^,]+$",
  description: '"provider,model" reference, e.g. "openrouter,google/gemini-2.5-pro"',
});

const RouterSchema = Type.Object(
  {
    default: Type.Optional(
      Type.Union([RouterModelRef, Type.String()], {
        description: "Default model for all requests",
      })
    ),
    background: Type.Optional(
      Type.Union([RouterModelRef, Type.String()], {
        description: "Model for background/lightweight tasks",
      })
    ),
    think: Type.Optional(
      Type.Union([RouterModelRef, Type.String()], {
        description: "Model for reasoning-intensive tasks (Plan Mode)",
      })
    ),
    longContext: Type.Optional(
      Type.Union([RouterModelRef, Type.String()], {
        description: "Model for requests exceeding longContextThreshold tokens",
      })
    ),
    longContextThreshold: Type.Optional(
      Type.Number({
        minimum: 0,
        default: 60000,
        description: "Token count that triggers longContext routing",
      })
    ),
    webSearch: Type.Optional(
      Type.Union([RouterModelRef, Type.String()], {
        description: "Model for web-search tasks",
      })
    ),
    image: Type.Optional(
      Type.Union([RouterModelRef, Type.String()], {
        description: "Model for image-related tasks",
      })
    ),
  },
  {
    additionalProperties: true,
    description:
      "Route specific task types to different models. Additional keys are treated as custom scenario names.",
  }
);

// Routers: named router profiles selected via x-ccr-route header.
// "default" key is required; additional keys are named profiles.
const RoutersSchema = Type.Object(
  {
    default: RouterSchema,
  },
  {
    additionalProperties: RouterSchema,
    description:
      'Named router profiles selected via the x-ccr-route request header. The "default" key is required and used when the header is absent or the named profile is not found.',
  }
);

const CustomTransformerPlugin = Type.Object({
  path: Type.String({
    description: "Absolute path to a transformer JS plugin file",
  }),
  options: Type.Optional(
    Type.Object(
      {},
      { additionalProperties: true, description: "Plugin-specific options" }
    )
  ),
});

const LogLevelSchema = Type.Union(
  [
    Type.Literal("fatal"),
    Type.Literal("error"),
    Type.Literal("warn"),
    Type.Literal("info"),
    Type.Literal("debug"),
    Type.Literal("trace"),
  ],
  { description: "Minimum log severity level", default: "debug" }
);

export const ConfigSchema = Type.Object(
  {
    PORT: Type.Optional(
      Type.Integer({
        minimum: 1,
        maximum: 65535,
        default: 3456,
        description: "TCP port the server listens on",
      })
    ),
    HOST: Type.Optional(
      Type.String({
        default: "127.0.0.1",
        description:
          "Host address the server binds to. Set 0.0.0.0 to accept external connections (requires APIKEY).",
      })
    ),
    APIKEY: Type.Optional(
      Type.String({
        description:
          "Secret key for request authentication. Sent as Authorization: Bearer <key> or x-api-key header.",
      })
    ),
    API_TIMEOUT_MS: Type.Optional(
      Type.Integer({
        minimum: 0,
        description: "Upstream API call timeout in milliseconds",
      })
    ),
    PROXY_URL: Type.Optional(
      Type.String({
        description:
          "HTTP proxy URL for upstream API requests, e.g. http://127.0.0.1:7890",
      })
    ),
    LOG: Type.Optional(
      Type.Boolean({
        default: true,
        description: "Enable rotating file logging to ~/.claude-code-router/logs/",
      })
    ),
    LOG_LEVEL: Type.Optional(LogLevelSchema),
    NON_INTERACTIVE_MODE: Type.Optional(
      Type.Boolean({
        description:
          "Disable stdin interaction; sets CI=true and FORCE_COLOR=0. Use in CI/CD pipelines.",
      })
    ),
    CLAUDE_PATH: Type.Optional(
      Type.String({
        default: "claude",
        description: "Path to the claude CLI executable",
      })
    ),
    CUSTOM_ROUTER_PATH: Type.Optional(
      Type.String({
        description:
          "Path to a JS file exporting a custom router function: (request, config) => 'provider,model'",
      })
    ),
    forceUseImageAgent: Type.Optional(
      Type.Boolean({
        description:
          "Always activate the built-in image agent, even if the model natively supports vision",
      })
    ),
    Providers: Type.Optional(
      Type.Array(ProviderSchema, {
        description: "Upstream LLM provider definitions",
      })
    ),
    Router: Type.Optional(RouterSchema),
    Routers: Type.Optional(RoutersSchema),
    transformers: Type.Optional(
      Type.Array(CustomTransformerPlugin, {
        description: "External transformer plugin files loaded at startup",
      })
    ),
  },
  {
    additionalProperties: true,
    $id: "CCRConfig",
    title: "Claude Code Router Configuration",
    description:
      "Configuration schema for ~/.claude-code-router/config.json. All fields are optional; unrecognised fields are preserved.",
  }
);

export type Config = Static<typeof ConfigSchema>;

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateConfig(config: unknown): ConfigValidationResult {
  if (Value.Check(ConfigSchema, config)) {
    return { valid: true, errors: [] };
  }
  const errors = [...Value.Errors(ConfigSchema, config)].map(
    (e) => `${e.path || "/"}: ${e.message}`
  );
  return { valid: false, errors };
}
