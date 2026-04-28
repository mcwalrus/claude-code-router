#!/usr/bin/env node
'use strict';

/**
 * Build-time script: generates dist/openapi.json from the route schemas
 * defined in api-schemas.ts (already compiled to dist/api-schemas.js).
 *
 * Uses @fastify/swagger (devDep) — not needed at runtime.
 * Runs after the esbuild + api-schemas compile steps in build-server.js.
 */

const path = require('path');
const fs = require('fs');

const serverDir = path.join(__dirname, '../packages/server');
const outPath = path.join(serverDir, 'dist/openapi.json');

async function main() {
  const Fastify = require(require.resolve('fastify', { paths: [serverDir] }));
  const swagger = require(require.resolve('@fastify/swagger', { paths: [serverDir] }));

  // Import compiled api-schemas (built by the preceding esbuild step in build-server.js)
  const { apiSchemas, configJsonSchema } = require(path.join(serverDir, 'dist/api-schemas.js'));

  const app = Fastify();

  app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Claude Code Router API',
        version: '1.0.0',
        description:
          'REST API for managing Claude Code Router configuration, presets, and logs. ' +
          'Authentication via x-api-key header is required only when Providers are configured.',
      },
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'x-api-key',
            description: 'Required when Providers are configured in config.json',
          },
        },
      },
    },
  });

  // Routes must be inside a child plugin for @fastify/swagger to capture them
  app.register(async (instance) => {
    instance.addSchema(configJsonSchema);
    instance.get('/health', { schema: apiSchemas.health }, async () => {});
    instance.get('/api/transformers', { schema: apiSchemas.transformers }, async () => {});
    instance.post('/v1/messages', { schema: apiSchemas.messages }, async () => {});
    instance.post('/v1/messages/count_tokens', { schema: apiSchemas.countTokens }, async () => {});
    instance.get('/api/config', { schema: apiSchemas.configGet }, async () => {});
    instance.post('/api/config', { schema: apiSchemas.configPost }, async () => {});
    instance.get('/api/config/schema', { schema: apiSchemas.configSchema }, async () => {});
    instance.get('/api/logs/files', { schema: apiSchemas.logFiles }, async () => {});
    instance.get('/api/logs', { schema: apiSchemas.logRead }, async () => {});
    instance.delete('/api/logs', { schema: apiSchemas.logClear }, async () => {});
    instance.get('/api/presets', { schema: apiSchemas.presetsList }, async () => {});
    instance.get('/api/presets/market', { schema: apiSchemas.presetsMarket }, async () => {});
    instance.get('/api/presets/:name', { schema: apiSchemas.presetsGet }, async () => {});
    instance.post('/api/presets/:name/apply', { schema: apiSchemas.presetsApply }, async () => {});
    instance.delete('/api/presets/:name', { schema: apiSchemas.presetsDelete }, async () => {});
    instance.post('/api/presets/install/github', { schema: apiSchemas.presetsInstallGithub }, async () => {});
  });

  await app.ready();
  const spec = app.swagger();

  fs.writeFileSync(outPath, JSON.stringify(spec, null, 2));
  console.log(`OpenAPI spec written to ${path.relative(process.cwd(), outPath)}`);
}

main().catch(err => {
  console.error('Failed to generate OpenAPI spec:', err);
  process.exit(1);
});
