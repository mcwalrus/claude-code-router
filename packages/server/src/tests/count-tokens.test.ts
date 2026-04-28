import { describe, it, expect, afterEach } from 'vitest'
import { buildApp } from './helpers'

describe('POST /v1/messages/count_tokens', () => {
  let server: Awaited<ReturnType<typeof buildApp>>

  afterEach(async () => { await server?.app.close() })

  it('returns token count for a simple message', async () => {
    server = await buildApp()
    const res = await server.app.inject({
      method: 'POST',
      url: '/v1/messages/count_tokens',
      payload: {
        messages: [{ role: 'user', content: 'hello world' }],
      },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('input_tokens')
    expect(typeof body.input_tokens).toBe('number')
    expect(body.input_tokens).toBeGreaterThan(0)
  })

  it('returns token count for multi-turn conversation', async () => {
    server = await buildApp()
    const res = await server.app.inject({
      method: 'POST',
      url: '/v1/messages/count_tokens',
      payload: {
        messages: [
          { role: 'user', content: 'What is the capital of France?' },
          { role: 'assistant', content: 'Paris.' },
          { role: 'user', content: 'And Germany?' },
        ],
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().input_tokens).toBeGreaterThan(0)
  })

  it('includes system prompt tokens when provided', async () => {
    server = await buildApp()
    const withSystem = await server.app.inject({
      method: 'POST',
      url: '/v1/messages/count_tokens',
      payload: {
        messages: [{ role: 'user', content: 'hi' }],
        system: 'You are a helpful assistant with a very long system prompt that adds tokens.',
      },
    })
    const without = await server.app.inject({
      method: 'POST',
      url: '/v1/messages/count_tokens',
      payload: {
        messages: [{ role: 'user', content: 'hi' }],
      },
    })
    expect(withSystem.json().input_tokens).toBeGreaterThan(without.json().input_tokens)
  })
})
