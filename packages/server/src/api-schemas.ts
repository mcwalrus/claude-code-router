import { ConfigSchema } from "@CCR/shared";

// Plain JSON Schema clone of the TypeBox config schema (used both at runtime and in OpenAPI gen)
export const configJsonSchema = JSON.parse(JSON.stringify(ConfigSchema));

const auth = [{ apiKey: [] }];

const successResponse = {
  type: "object" as const,
  properties: { success: { type: "boolean" }, message: { type: "string" } },
};

export const apiSchemas = {
  // System
  health: {
    summary: "Health check",
    tags: ["System"],
    response: { 200: { type: "object", properties: { status: { type: "string" } } } },
  },
  transformers: {
    summary: "List registered transformers",
    tags: ["System"],
    response: {
      200: {
        type: "object",
        properties: {
          transformers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                endpoint: { type: "string", nullable: true },
              },
            },
          },
        },
      },
    },
  },

  // Proxy
  messages: {
    summary: "Send message (Anthropic proxy)",
    description:
      "Forwards Anthropic-format requests to the configured upstream provider with model routing applied.",
    tags: ["Proxy"],
    security: auth,
    body: { type: "object", additionalProperties: true },
    response: { 200: { type: "object", additionalProperties: true } },
  },
  countTokens: {
    summary: "Count tokens",
    description:
      "Estimates the token count for a given message payload using tiktoken or a configured provider tokenizer.",
    tags: ["Proxy"],
    security: auth,
    body: { type: "object", additionalProperties: true },
    response: {
      200: {
        type: "object",
        properties: {
          input_tokens: { type: "integer" },
          tokenizer: { type: "string" },
        },
      },
    },
  },

  // Configuration
  configGet: {
    summary: "Read current configuration",
    description: "Returns the contents of ~/.claude-code-router/config.json.",
    tags: ["Configuration"],
    security: auth,
    response: { 200: { type: "object", additionalProperties: true } },
  },
  configPost: {
    summary: "Save configuration",
    description:
      "Overwrites ~/.claude-code-router/config.json. A timestamped backup of the previous config is created automatically.",
    tags: ["Configuration"],
    security: auth,
    body: { type: "object", additionalProperties: true },
    response: { 200: successResponse },
  },
  configSchema: {
    summary: "Get configuration JSON Schema",
    description:
      "Returns the raw JSON Schema for config.json — includes all fields, types, and descriptions. Useful for AI agents and tooling.",
    tags: ["Configuration"],
    response: { 200: { $ref: "CCRConfig#" } },
  },

  // Logs
  logFiles: {
    summary: "List log files",
    tags: ["Logs"],
    security: auth,
    response: {
      200: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            path: { type: "string" },
            size: { type: "number" },
            lastModified: { type: "string", format: "date-time" },
          },
        },
      },
    },
  },
  logRead: {
    summary: "Read log content",
    tags: ["Logs"],
    security: auth,
    querystring: {
      type: "object",
      properties: { file: { type: "string", description: "Absolute path to a specific log file" } },
    },
    response: { 200: { type: "array", items: { type: "string" } } },
  },
  logClear: {
    summary: "Clear log content",
    tags: ["Logs"],
    security: auth,
    querystring: {
      type: "object",
      properties: { file: { type: "string", description: "Absolute path to a specific log file to clear" } },
    },
    response: { 200: successResponse },
  },

  // Presets
  presetItem: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      version: { type: "string" },
      description: { type: "string" },
      author: { type: "string" },
      keywords: { type: "array", items: { type: "string" } },
      installed: { type: "boolean" },
    },
  },
  presetsList: {
    summary: "List installed presets",
    tags: ["Presets"],
    security: auth,
    response: { 200: { type: "object", properties: { presets: { type: "array", items: { type: "object", additionalProperties: true } } } } },
  },
  presetsMarket: {
    summary: "List marketplace presets",
    tags: ["Presets"],
    response: { 200: { type: "object", properties: { presets: { type: "array", items: { type: "object", additionalProperties: true } } } } },
  },
  presetsGet: {
    summary: "Get preset details",
    tags: ["Presets"],
    security: auth,
    params: { type: "object", properties: { name: { type: "string" } } },
    response: { 200: { type: "object", additionalProperties: true } },
  },
  presetsApply: {
    summary: "Apply preset secrets",
    description: "Fills in sensitive fields (API keys etc.) for an installed preset.",
    tags: ["Presets"],
    security: auth,
    params: { type: "object", properties: { name: { type: "string" } } },
    body: {
      type: "object",
      properties: { secrets: { type: "object", additionalProperties: true } },
    },
    response: { 200: successResponse },
  },
  presetsDelete: {
    summary: "Delete preset",
    tags: ["Presets"],
    security: auth,
    params: { type: "object", properties: { name: { type: "string" } } },
    response: { 200: successResponse },
  },
  // Interactive
  interactiveChoice: {
    summary: "Choose model for interactive session",
    tags: ["Interactive"],
    body: {
      type: "object",
      required: ["sessionId", "model"],
      properties: {
        sessionId: { type: "string", description: "Session ID awaiting model choice" },
        model: { type: "string", description: "Selected provider,model string" },
      },
    },
    response: {
      200: { type: "object", properties: { success: { type: "boolean" }, sessionId: { type: "string" }, model: { type: "string" } } },
      400: { type: "object", properties: { error: { type: "string" } } },
      404: { type: "object", properties: { error: { type: "string" } } },
    },
  },
  interactiveSessions: {
    summary: "List sessions awaiting model choice",
    tags: ["Interactive"],
    response: {
      200: { type: "object", properties: { sessions: { type: "array", items: { type: "object", additionalProperties: true } } } },
    },
  },

  presetsInstallGithub: {
    summary: "Install preset from GitHub marketplace",
    tags: ["Presets"],
    body: {
      type: "object",
      required: ["presetName"],
      properties: { presetName: { type: "string", description: "Name of the preset in the marketplace" } },
    },
    response: {
      200: { type: "object", additionalProperties: true },
      409: { type: "object", properties: { error: { type: "string" }, presetName: { type: "string" } } },
    },
  },
};
