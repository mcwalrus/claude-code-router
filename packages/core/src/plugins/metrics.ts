import fp from "fastify-plugin";
import { CCRPlugin, CCRPluginOptions } from "./types";
import {
  Counter,
  Histogram,
  Gauge,
  Registry,
  collectDefaultMetrics,
} from "prom-client";
import Fastify from "fastify";

interface MetricsOptions extends CCRPluginOptions {
  /** Port for the metrics scraping server (default: 9464) */
  port?: number;
  /** Host for the metrics scraping server (default: 127.0.0.1) */
  host?: string;
  /** Metric name prefix (default: ccr) */
  prefix?: string;
  /** Whether to collect Node.js process metrics (default: true) */
  collectDefault?: boolean;
}

/**
 * Metrics plugin for CCR.
 *
 * Collects request-level, provider-level, and token-level metrics via Fastify
 * hooks on the main application.  Exposes them in Prometheus text format on a
 * *separate* HTTP server so scrapers never hit the proxy port.
 *
 * Usage in config.json:
 *   { "plugins": [{ "name": "metrics", "enabled": true, "options": { "port": 9464 } }] }
 */
export const metricsPlugin: CCRPlugin = {
  name: "metrics",
  version: "1.0.0",
  description:
    "Prometheus-compatible metrics endpoint served on a dedicated port",

  register: fp(async (fastify, options: MetricsOptions) => {
    const opts = {
      port: 9464,
      host: "127.0.0.1",
      prefix: "ccr",
      collectDefault: true,
      ...options,
    };
    const p = opts.prefix;

    /* ------------------------------------------------------------------ */
    /* 1.  Prometheus Registry & Metric definitions                       */
    /* ------------------------------------------------------------------ */
    const registry = new Registry();

    if (opts.collectDefault) {
      collectDefaultMetrics({ register: registry, prefix: `${p}_node_` });
    }

    const requestCounter = new Counter({
      name: `${p}_requests_total`,
      help: "Total HTTP requests handled by the proxy",
      labelNames: ["method", "route", "status_code"],
      registers: [registry],
    });

    const requestDuration = new Histogram({
      name: `${p}_request_duration_seconds`,
      help: "HTTP request duration in seconds",
      labelNames: ["method", "route", "status_code"],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
      registers: [registry],
    });

    const hop = (fastify.configService?.get("PROXY_HOP") as string) || "local";

    const providerRouteCounter = new Counter({
      name: `${p}_provider_routes_total`,
      help: "LLM requests routed per provider, model and scenario",
      labelNames: ["provider", "model", "scenario", "hop"],
      registers: [registry],
    });

    const tokenCounter = new Counter({
      name: `${p}_tokens_total`,
      help: "Token usage across all requests",
      labelNames: ["provider", "model", "type", "hop"],
      registers: [registry],
    });

    const activeRequests = new Gauge({
      name: `${p}_active_requests`,
      help: "Number of requests currently in flight",
      registers: [registry],
    });

    const errorCounter = new Counter({
      name: `${p}_errors_total`,
      help: "Total errors by route and error type",
      labelNames: ["route", "error_type"],
      registers: [registry],
    });

    const pluginGauge = new Gauge({
      name: `${p}_plugin_enabled`,
      help: "Whether a given CCR plugin is enabled (1 = yes, 0 = no)",
      labelNames: ["plugin"],
      registers: [registry],
    });

    /* ------------------------------------------------------------------ */
    /* 2.  Mark built-in / registered plugins so scrapers know health     */
    /* ------------------------------------------------------------------ */
    try {
      const pluginManager = (fastify as any).pluginManager;
      if (pluginManager) {
        for (const meta of pluginManager.getPlugins()) {
          pluginGauge.set({ plugin: meta.name }, meta.enabled ? 1 : 0);
        }
      } else {
        // token-speed is the only one we can see from inside this hook
        pluginGauge.set({ plugin: "token-speed" }, 1);
      }
    } catch {
      /* no-op */
    }

    /* ------------------------------------------------------------------ */
    /* 3.  Collect on main server via global Fastify hooks                */
    /* ------------------------------------------------------------------ */
    fastify.addHook("onRequest", async (request) => {
      (request as any).metricsStartTime = process.hrtime.bigint();
      activeRequests.inc();
    });

    fastify.addHook("onResponse", async (request, reply) => {
      const start = (request as any).metricsStartTime as bigint | undefined;
      const durationSec =
        start !== undefined
          ? Number(process.hrtime.bigint() - start) / 1e9
          : 0;

      const labels = {
        method: request.method,
        route: (request as any).routerPath || request.url,
        status_code: reply.statusCode.toString(),
      };

      requestCounter.inc(labels);
      requestDuration.observe(labels, durationSec);
      activeRequests.dec();
    });

    // Capture routing decisions from the router hook
    fastify.addHook("preHandler", async (request) => {
      const url = new URL(`http://127.0.0.1${request.url}`);
      if (url.pathname.endsWith("/v1/messages")) {
        const body = request.body as any;
        const provider = (request as any).provider || "unknown";
        const model = (request.body as any)?.model || "unknown";
        const scenario = (request as any).scenarioType || "unknown";
        providerRouteCounter.inc({ provider, model, scenario, hop });

        // If non-streaming and usage already present, record tokens immediately
        if (!body?.stream && body?.usage) {
          const u = body.usage;
          if (u.input_tokens) {
            tokenCounter.inc({ provider, model, type: "input", hop }, u.input_tokens);
          }
          if (u.output_tokens) {
            tokenCounter.inc(
              { provider, model, type: "output", hop },
              u.output_tokens
            );
          }
        }
      }
    });

    // Capture token usage from streaming responses in onSend
    fastify.addHook("onSend", async (request, _reply, payload) => {
      const url = new URL(`http://127.0.0.1${request.url}`);
      if (!url.pathname.endsWith("/v1/messages")) return;

      const provider = (request as any).provider || "unknown";
      const model = (request.body as any)?.model || "unknown";

      // Non-streaming: payload is the final response object with usage
      if (payload && typeof payload === "object" && !(payload as any).error) {
        const usage = (payload as any).usage;
        if (usage) {
          if (usage.input_tokens) {
            tokenCounter.inc(
              { provider, model, type: "input", hop },
              usage.input_tokens
            );
          }
          if (usage.output_tokens) {
            tokenCounter.inc(
              { provider, model, type: "output", hop },
              usage.output_tokens
            );
          }
        }
        return;
      }

      // Streaming: observe the SSE events for usage blocks
      if (payload instanceof ReadableStream) {
        const { SSEParserTransform } = await import("../utils/sse");
        const [clientStream, metricsStream] = payload.tee();

        (async () => {
          try {
            const eventStream = metricsStream.pipeThrough(
              new SSEParserTransform() as any
            );
            const reader = eventStream.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const data = value as any;
              if (data.event === "message_delta" && data.data?.usage) {
                const u = data.data.usage;
                if (u.output_tokens) {
                  tokenCounter.inc(
                    { provider, model, type: "output", hop },
                    u.output_tokens
                  );
                }
              }
            }
          } catch {
            /* ignore stream errors in metrics */
          }
        })();

        return clientStream;
      }
    });

    // Error tracking
    fastify.addHook("onError", async (request, _reply, error) => {
      const code = (error as any).code || "unknown";
      errorCounter.inc({
        route: (request as any).routerPath || request.url,
        error_type: code,
      });
    });

    /* ------------------------------------------------------------------ */
    /* 4.  Standalone metrics HTTP server on separate port                */
    /* ------------------------------------------------------------------ */
    const metricsApp = Fastify({ logger: false });

    metricsApp.get("/metrics", async (_req, reply) => {
      reply.header("Content-Type", registry.contentType);
      return registry.metrics();
    });

    metricsApp.get("/health", async () => ({
      status: "ok",
      timestamp: new Date().toISOString(),
    }));

    await metricsApp.listen({ port: opts.port, host: opts.host });
    fastify.log?.info(
      `📊 Metrics server listening on http://${opts.host}:${opts.port}/metrics`
    );

    // Ensure metrics server shuts down with the main app
    fastify.addHook("onClose", async () => {
      await metricsApp.close();
    });
  }),
};
