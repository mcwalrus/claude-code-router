import { describe, it, expect } from "vitest";
import { loadEnvConfig } from "./env-config";

describe("loadEnvConfig", () => {
  it("maps basic flat keys", () => {
    const config = loadEnvConfig({
      env: {
        CCR_PORT: "8080",
        CCR_HOST: "0.0.0.0",
        CCR_APIKEY: "secret",
        CCR_LOG_LEVEL: "info",
      },
    });
    expect(config).toEqual({
      PORT: 8080,
      HOST: "0.0.0.0",
      APIKEY: "secret",
      LOG_LEVEL: "info",
    });
  });

  it("coerces booleans and numbers", () => {
    const config = loadEnvConfig({
      env: {
        CCR_LOG: "true",
        CCR_NON_INTERACTIVE_MODE: "false",
        CCR_API_TIMEOUT_MS: "120000",
      },
    });
    expect(config.LOG).toBe(true);
    expect(config.NON_INTERACTIVE_MODE).toBe(false);
    expect(config.API_TIMEOUT_MS).toBe(120000);
  });

  it("ignores unknown keys", () => {
    const config = loadEnvConfig({
      env: { CCR_SOMETHING_RANDOM: "nope", NOT_CCR: "ignored" },
    });
    expect(config).toEqual({});
  });

  it("parses CCR_PLUGINS as JSON", () => {
    const config = loadEnvConfig({
      env: {
        CCR_PLUGINS: '[{"name":"metrics","enabled":true,"options":{"port":9464}}]',
      },
    });
    expect(config.plugins).toEqual([
      { name: "metrics", enabled: true, options: { port: 9464 } },
    ]);
  });

  it("warns and ignores invalid CCR_PLUGINS JSON", () => {
    const config = loadEnvConfig({
      env: { CCR_PLUGINS: "not-json" },
    });
    expect(config).toEqual({});
  });

  it("builds Router subset from multiple CCR_ROUTER_* vars", () => {
    const config = loadEnvConfig({
      env: {
        CCR_ROUTER_DEFAULT: "anthropic,opus",
        CCR_ROUTER_LONG_CONTEXT_THRESHOLD: "60000",
      },
    });
    expect(config).toEqual({
      Router: { default: "anthropic,opus", longContextThreshold: 60000 },
    });
  });

  it("returns empty when no CCR_ vars", () => {
    const config = loadEnvConfig({
      env: { PATH: "/usr/bin", HOME: "/home/user" },
    });
    expect(config).toEqual({});
  });
});
