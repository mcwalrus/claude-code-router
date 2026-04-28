import { describe, it, expect, afterEach, vi } from 'vitest'
import { buildApp } from './helpers'

vi.mock('../utils', () => ({
  readConfigFile: vi.fn().mockResolvedValue({ PORT: 3456, Providers: [], Router: {} }),
  writeConfigFile: vi.fn().mockResolvedValue(undefined),
  backupConfigFile: vi.fn().mockResolvedValue(null),
  initDir: vi.fn().mockResolvedValue(undefined),
  initConfig: vi.fn().mockResolvedValue({ PORT: 3456, Providers: [], Router: {} }),
}))

describe('GET /api/config', () => {
  let server: Awaited<ReturnType<typeof buildApp>>

  afterEach(async () => { await server?.app.close() })

  it('returns the current config', async () => {
    server = await buildApp()
    const res = await server.app.inject({ method: 'GET', url: '/api/config' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('PORT', 3456)
    expect(body).toHaveProperty('Providers')
  })
})

describe('POST /api/config', () => {
  let server: Awaited<ReturnType<typeof buildApp>>

  afterEach(async () => { await server?.app.close() })

  it('saves config and returns success', async () => {
    server = await buildApp()
    const newConfig = { PORT: 3456, Providers: [], Router: {} }
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/config',
      payload: newConfig,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ success: true })
  })
})
