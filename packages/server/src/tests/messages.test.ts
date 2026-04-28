import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { mswServer } from './setup/msw'
import { buildFullApp } from './helpers'

const isE2E = process.env.CCR_TEST_MODE === 'e2e'

const testProvider = {
  name: 'anthropic',
  api_base_url: 'https://api.anthropic.com',
  api_key: isE2E ? process.env.ANTHROPIC_API_KEY : 'test-key',
  models: [],
}

describe('POST /v1/messages', () => {
  let server: Awaited<ReturnType<typeof buildFullApp>>

  beforeAll(async () => {
    if (!isE2E) mswServer.listen({ onUnhandledRequest: 'error' })
    server = await buildFullApp([testProvider])
  })

  afterEach(() => {
    if (!isE2E) mswServer.resetHandlers()
  })

  afterAll(async () => {
    if (!isE2E) mswServer.close()
    await server?.app.close()
  })

  describe.skipIf(isE2E)('mock mode', () => {
    // TODO: The AnthropicTransformer converts outgoing requests FROM Anthropic format
    // TO OpenAI format, and converts incoming responses FROM OpenAI format back TO
    // Anthropic format. The MSW handler in handlers/providers.ts must therefore return
    // an OpenAI chat completion object (not an Anthropic messages object) for the
    // transformer to process correctly. Update the handler and assertions accordingly.
    it.todo('routes request through provider and returns response (needs OpenAI-format mock)')

    it('returns 400 when model field is missing', async () => {
      const res = await server.app.inject({
        method: 'POST',
        url: '/v1/messages',
        payload: {
          messages: [{ role: 'user', content: 'hello' }],
          max_tokens: 100,
        },
      })
      expect(res.statusCode).toBe(400)
    })
  })

  describe.skipIf(!isE2E)('e2e mode — requires ANTHROPIC_API_KEY', () => {
    it.todo('routes to live anthropic provider')
  })
})
