import { describe, it, expect, afterEach } from 'vitest'
import Fastify from 'fastify'
import { addModelSplitHook } from './server'

async function buildApp() {
  const app = Fastify({ logger: false })

  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    try {
      done(null, JSON.parse(body as string))
    } catch (err) {
      done(err as Error, undefined)
    }
  })

  addModelSplitHook(app)

  app.post('/v1/messages', async (req: any) => {
    return { provider: req.provider, model: req.model }
  })

  await app.ready()
  return app
}

describe('addModelSplitHook', () => {
  const apps: ReturnType<typeof Fastify>[] = []

  afterEach(async () => {
    for (const app of apps) {
      await app.close()
    }
    apps.length = 0
  })

  it('returns 400 when body.model is missing', async () => {
    const app = await buildApp()
    apps.push(app)

    const res = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      payload: { messages: [] },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: 'Missing model in request body' })
  })

  it('returns 400 when body.model is empty string', async () => {
    const app = await buildApp()
    apps.push(app)

    const res = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      payload: { model: '', messages: [] },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: 'Missing model in request body' })
  })

  it('splits provider,model and sets req.provider and req.model', async () => {
    const app = await buildApp()
    apps.push(app)

    const res = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      payload: { model: 'anthropic,claude-sonnet-4-6', messages: [] },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.provider).toBe('anthropic')
    expect(body.model).toEqual(['claude-sonnet-4-6'])
  })

  it('handles model names with commas by joining remaining parts', async () => {
    const app = await buildApp()
    apps.push(app)

    const res = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      payload: { model: 'vertex,claude-3,opus', messages: [] },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.provider).toBe('vertex')
    expect(body.model).toEqual(['claude-3', 'opus'])
  })

  it('does not intercept non-messages endpoints', async () => {
    const app = Fastify({ logger: false })
    apps.push(app)

    addModelSplitHook(app)

    app.post('/v1/other', async () => ({ ok: true }))
    await app.ready()

    const res = await app.inject({
      method: 'POST',
      url: '/v1/other',
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ ok: true })
  })
})

// Mirrors the hook registration order in registerNamespace('/') (server.ts):
//   1. routerHook (preHandler) — rewrites body.model to "provider,model" format
//   2. addModelSplitHook    — splits body.model into req.provider / req.model
// This ordering guarantee must hold so modelSplitHook always sees the router's
// provider-qualified model string, not the original request model name.
describe('routerHook → addModelSplitHook ordering in "/" namespace', () => {
  const apps: ReturnType<typeof Fastify>[] = []

  afterEach(async () => {
    for (const app of apps) {
      await app.close()
    }
    apps.length = 0
  })

  function buildAppWithRouterFirst(routerModel: string) {
    const app = Fastify({ logger: false })
    apps.push(app)

    app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
      try {
        done(null, JSON.parse(body as string))
      } catch (err) {
        done(err as Error, undefined)
      }
    })

    // Simulate routerHook: runs first and rewrites body.model to "provider,model" format
    app.addHook('preHandler', async (req: any) => {
      const url = new URL(`http://127.0.0.1${req.url}`)
      if (url.pathname.endsWith('/v1/messages') && req.body) {
        req.body.model = routerModel
      }
    })

    addModelSplitHook(app)

    app.post('/v1/messages', async (req: any) => ({
      provider: req.provider,
      model: req.model,
    }))

    return app
  }

  it('splits provider and model from the router-rewritten body.model, not the original request model', async () => {
    const app = await buildAppWithRouterFirst('anthropic,claude-sonnet-4-6')
    await app.ready()

    const res = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      // Original request uses a plain model name; router rewrites it to provider,model format
      payload: { model: 'claude-opus-4-7', messages: [] },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.provider).toBe('anthropic')
    expect(body.model).toEqual(['claude-sonnet-4-6'])
  })

  it('reflects the router-chosen provider even when the original request used a different model', async () => {
    const app = await buildAppWithRouterFirst('openai,gpt-4o')
    await app.ready()

    const res = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      payload: { model: 'claude-opus-4-7', messages: [] },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.provider).toBe('openai')
    expect(body.model).toEqual(['gpt-4o'])
  })
})
