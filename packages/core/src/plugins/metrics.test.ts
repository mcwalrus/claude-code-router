import { describe, it, expect, afterEach } from 'vitest'
import Fastify from 'fastify'
import { metricsPlugin } from './metrics'

async function buildApp(opts: { hop?: string; port: number }) {
  const app = Fastify({ logger: false })

  app.post('/v1/messages', async () => {
    return { id: 'msg_test', type: 'message', role: 'assistant', content: [] }
  })

  await app.register(metricsPlugin.register, {
    port: opts.port,
    collectDefault: false,
    ...(opts.hop !== undefined ? { hop: opts.hop } : {}),
  })

  await app.ready()
  return app
}

async function fetchMetrics(port: number): Promise<string> {
  const resp = await fetch(`http://127.0.0.1:${port}/metrics`)
  return resp.text()
}

describe('metricsPlugin hop label', () => {
  const apps: ReturnType<typeof Fastify>[] = []

  afterEach(async () => {
    for (const app of apps) {
      await app.close()
    }
    apps.length = 0
  })

  it('defaults hop to "local" when no hop option provided', async () => {
    const app = await buildApp({ port: 19464 })
    apps.push(app)

    // Trigger the preHandler hook so providerRouteCounter fires
    await app.inject({
      method: 'POST',
      url: '/v1/messages',
      payload: { model: 'claude-sonnet-4-6', messages: [] },
    })

    const metrics = await fetchMetrics(19464)
    expect(metrics).toMatch(/ccr_provider_routes_total\{[^}]*hop="local"[^}]*\}/)
  })

  it('uses the provided hop option', async () => {
    const app = await buildApp({ hop: 'gascity', port: 19465 })
    apps.push(app)

    await app.inject({
      method: 'POST',
      url: '/v1/messages',
      payload: { model: 'claude-sonnet-4-6', messages: [] },
    })

    const metrics = await fetchMetrics(19465)
    expect(metrics).toMatch(/ccr_provider_routes_total\{[^}]*hop="gascity"[^}]*\}/)
  })
})
