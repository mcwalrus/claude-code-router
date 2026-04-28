import { describe, it, expect, beforeEach } from 'vitest'
import {
  calculateTokenCount,
  router,
  clearSessionChoice,
  setSessionModelChoice,
  getSessionModelChoice,
  isSessionAwaitingChoice,
  getInteractiveSessionsInfo,
} from './router'

describe('calculateTokenCount', () => {
  it('returns 0 for empty inputs', () => {
    expect(calculateTokenCount([], undefined, [])).toBe(0)
  })

  it('counts tokens in a simple string message', () => {
    const messages = [{ role: 'user', content: 'Hello world' }]
    const count = calculateTokenCount(messages as any, undefined, [])
    expect(count).toBeGreaterThan(0)
  })

  it('counts tokens from system string', () => {
    const count = calculateTokenCount([], 'You are a helpful assistant.', [])
    expect(count).toBeGreaterThan(0)
  })

  it('counts tokens from array-style system prompt', () => {
    const system = [{ type: 'text', text: 'You are helpful.' }]
    const count = calculateTokenCount([], system, [])
    expect(count).toBeGreaterThan(0)
  })

  it('counts tokens from tool definitions', () => {
    const tools = [{
      name: 'get_weather',
      description: 'Get the current weather',
      input_schema: { type: 'object', properties: { location: { type: 'string' } } },
    }]
    const count = calculateTokenCount([], undefined, tools as any)
    expect(count).toBeGreaterThan(0)
  })

  it('accumulates tokens across messages, system, and tools', () => {
    const messages = [{ role: 'user', content: 'What is the weather?' }]
    const system = 'You are a weather assistant.'
    const tools = [{
      name: 'get_weather',
      description: 'Get weather',
      input_schema: { type: 'object' },
    }]

    const combined = calculateTokenCount(messages as any, system, tools as any)
    const msgOnly = calculateTokenCount(messages as any, undefined, [])
    const sysOnly = calculateTokenCount([], system, [])
    const toolOnly = calculateTokenCount([], undefined, tools as any)

    expect(combined).toBe(msgOnly + sysOnly + toolOnly)
  })

  it('handles array message content with text and tool blocks', () => {
    const messages = [{
      role: 'assistant',
      content: [
        { type: 'text', text: 'Let me check.' },
        { type: 'tool_use', input: { location: 'London' } },
      ],
    }]
    const count = calculateTokenCount(messages as any, undefined, [])
    expect(count).toBeGreaterThan(0)
  })
})

// Minimal dummy Req/Res for router tests
function makeDummyReq(bodyOverrides: any = {}) {
  return {
    id: 'req-' + Math.random().toString(36).slice(2),
    body: {
      metadata: { user_id: 'user_session_abc123' },
      model: 'anthropic,claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'Hello' }],
      ...bodyOverrides,
    },
    log: { info: () => {}, error: () => {}, warn: () => {} },
    sessionId: 'abc123',
  }
}

function makeConfigService(overrides: any = {}) {
  const store = {
    interactive: false,
    CCR_INTERACTIVE: undefined,
    Router: {
      default: 'providerA,default-model',
      think: 'providerA,think-model',
      background: 'providerA,background-model',
      webSearch: 'providerA,websearch-model',
      longContext: 'providerA,longcontext-model',
    },
    providers: [
      { name: 'providerA', models: ['default-model', 'think-model', 'background-model', 'websearch-model', 'longcontext-model'] },
    ],
    ...overrides,
  }
  return {
    get: (key: string) => store[key as keyof typeof store],
    getAll: () => store,
  } as any
}

describe('interactive routing', () => {
  beforeEach(() => {
    clearSessionChoice('abc123')
  })

  it('buffers the first request when interactive mode is on and no model is chosen yet', async () => {
    const req = makeDummyReq()
    const configService = makeConfigService({ interactive: true })
    const context = { configService, tokenizerService: undefined, event: undefined }

    // First call should buffer and return early without setting model
    await router(req, {}, context)
    expect(req.body.model).toBe('anthropic,claude-sonnet-4-5') // unchanged because buffered
    expect(isSessionAwaitingChoice('abc123')).toBe(true)
  })

  it('uses the chosen model for subsequent requests in the same session', async () => {
    const req1 = makeDummyReq()
    const configService = makeConfigService({ interactive: true })
    const context = { configService, tokenizerService: undefined, event: undefined }

    // First request buffers
    await router(req1, {}, context)
    expect(isSessionAwaitingChoice('abc123')).toBe(true)

    // User picks a model
    setSessionModelChoice('abc123', 'providerA,think-model')
    expect(getSessionModelChoice('abc123')).toBe('providerA,think-model')
    expect(isSessionAwaitingChoice('abc123')).toBe(false)

    // Second request should use the chosen model
    const req2: any = makeDummyReq()
    await router(req2, {}, context)
    expect(req2.body.model).toBe('providerA,think-model')
    expect(req2.scenarioType).toBe('interactive')
  })

  it('does not buffer when interactive mode is off', async () => {
    const req = makeDummyReq()
    const configService = makeConfigService({ interactive: false })
    const context = { configService, tokenizerService: undefined, event: undefined }

    await router(req, {}, context)
    expect(isSessionAwaitingChoice('abc123')).toBe(false)
    // model gets auto-routed (body.model already contains comma so left as-is in this dummy)
    expect(req.body.model).toBe('anthropic,claude-sonnet-4-5')
  })

  it('does not buffer when there is no sessionId', async () => {
    const req = makeDummyReq({ metadata: { user_id: 'user_nosession' } })
    delete (req as any).sessionId
    const configService = makeConfigService({ interactive: true })
    const context = { configService, tokenizerService: undefined, event: undefined }

    await router(req, {}, context)
    // Should not buffer because no sessionId is present
    const someSession = isSessionAwaitingChoice('abc123') || isSessionAwaitingChoice('nosession')
    expect(someSession).toBe(false)
    // Falls through to normal routing
    expect(req.body.model).toBe('anthropic,claude-sonnet-4-5')
  })

  it('exposes pending session info', async () => {
    const req = makeDummyReq()
    const configService = makeConfigService({ interactive: true, interactiveModels: ['providerA,think-model', 'providerA,default-model'] })
    const context = { configService, tokenizerService: undefined, event: undefined }

    await router(req, {}, context)
    const info = getInteractiveSessionsInfo()
    expect(info).toHaveLength(1)
    expect(info[0].sessionId).toBe('abc123')
    expect(info[0].scenario).toBeDefined()
    expect(info[0].availableModels).toEqual(['providerA,think-model', 'providerA,default-model'])
  })
})
