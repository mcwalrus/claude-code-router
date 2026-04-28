import { describe, it, expect, vi } from 'vitest'
import { apiKeyAuth } from './auth'

function makeReply() {
  const reply = {
    _status: 0,
    _body: undefined as any,
    _headers: {} as Record<string, string>,
    status(code: number) { this._status = code; return this },
    send(body: any) { this._body = body; return this },
    header(key: string, val: string) { this._headers[key] = val; return this },
    code(code: number) { this._status = code; return this },
  }
  return reply as any
}

function makeReq(url: string, headers: Record<string, string> = {}) {
  return { url, headers } as any
}

const done = vi.fn()

describe('apiKeyAuth', () => {
  it('passes public paths without checking anything', async () => {
    const handler = apiKeyAuth({})
    const reply = makeReply()
    await handler(makeReq('/'), reply, done)
    expect(done).toHaveBeenCalled()
    done.mockClear()

    await handler(makeReq('/health'), reply, done)
    expect(done).toHaveBeenCalled()
    done.mockClear()
  })

  it('passes UI paths without auth', async () => {
    const handler = apiKeyAuth({})
    const reply = makeReply()
    await handler(makeReq('/ui/index.html'), reply, done)
    expect(done).toHaveBeenCalled()
    done.mockClear()
  })

  it('skips auth when no providers are configured', async () => {
    const handler = apiKeyAuth({ Providers: [] })
    const reply = makeReply()
    await handler(makeReq('/v1/messages'), reply, done)
    expect(done).toHaveBeenCalled()
    done.mockClear()
  })

  it('rejects cross-origin requests when providers set but no APIKEY', async () => {
    const config = { Providers: [{ name: 'deepseek' }], PORT: 3456 }
    const handler = apiKeyAuth(config)
    const reply = makeReply()
    const req = makeReq('/v1/messages', { origin: 'http://evil.com' })
    await handler(req, reply, done)
    expect(reply._status).toBe(403)
    expect(done).not.toHaveBeenCalled()
  })

  it('allows same-origin requests when providers set but no APIKEY', async () => {
    const config = { Providers: [{ name: 'deepseek' }], PORT: 3456 }
    const handler = apiKeyAuth(config)
    const reply = makeReply()
    const req = makeReq('/v1/messages', { origin: 'http://localhost:3456' })
    await handler(req, reply, done)
    expect(done).toHaveBeenCalled()
    done.mockClear()
  })

  it('rejects request with no auth header when APIKEY is set', async () => {
    const config = { Providers: [{ name: 'deepseek' }], APIKEY: 'secret' }
    const handler = apiKeyAuth(config)
    const reply = makeReply()
    await handler(makeReq('/v1/messages'), reply, done)
    expect(reply._status).toBe(401)
    expect(done).not.toHaveBeenCalled()
  })

  it('rejects request with wrong Bearer token', async () => {
    const config = { Providers: [{ name: 'deepseek' }], APIKEY: 'secret' }
    const handler = apiKeyAuth(config)
    const reply = makeReply()
    const req = makeReq('/v1/messages', { authorization: 'Bearer wrong' })
    await handler(req, reply, done)
    expect(reply._status).toBe(401)
    expect(done).not.toHaveBeenCalled()
  })

  it('passes request with correct Bearer token', async () => {
    const config = { Providers: [{ name: 'deepseek' }], APIKEY: 'secret' }
    const handler = apiKeyAuth(config)
    const reply = makeReply()
    const req = makeReq('/v1/messages', { authorization: 'Bearer secret' })
    await handler(req, reply, done)
    expect(done).toHaveBeenCalled()
    done.mockClear()
  })

  it('passes request with correct x-api-key header', async () => {
    const config = { Providers: [{ name: 'deepseek' }], APIKEY: 'secret' }
    const handler = apiKeyAuth(config)
    const reply = makeReply()
    const req = makeReq('/v1/messages', { 'x-api-key': 'secret' })
    await handler(req, reply, done)
    expect(done).toHaveBeenCalled()
    done.mockClear()
  })
})
