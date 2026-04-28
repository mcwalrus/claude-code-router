import { createServer } from '../server'

/**
 * Builds a test app instance for routes defined in server.ts (config, presets,
 * logs, transformers, count_tokens).
 *
 * Does NOT register core LLM proxy routes (/v1/messages) — use buildFullApp for those.
 */
export async function buildApp(overrideConfig: Record<string, any> = {}) {
  const server = await createServer({
    useJsonFile: false,
    initialConfig: {
      providers: [],
      HOST: '127.0.0.1',
      PORT: 0,
      ...overrideConfig,
    },
    logger: false,
  })

  // _server is normally set by start() in production; set it here so routes
  // that access server services (transformerService, tokenizerService) work.
  ;(server.app as any)._server = server

  await server.app.ready()
  return server
}

/**
 * Builds a fully-initialised test app that also registers core LLM proxy routes
 * (/v1/messages). Binds to an ephemeral port; call server.app.close() in teardown.
 *
 * Used for Tier 3 (messages) tests with MSW or a real provider.
 */
export async function buildFullApp(providers: any[] = []) {
  const server = await createServer({
    useJsonFile: false,
    initialConfig: {
      providers,
      HOST: '127.0.0.1',
      PORT: 0,
    },
    logger: false,
  })

  // Allow the constructor's async initialisation (transformerService.initialize()
  // sets providerService in its .finally callback) to complete before start().
  await new Promise<void>(resolve => setImmediate(resolve))

  await server.start()
  return server
}
