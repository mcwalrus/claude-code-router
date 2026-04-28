import { describe, it, expect, afterEach } from 'vitest'
import { buildApp } from './helpers'

describe('GET /api/transformers', () => {
  let server: Awaited<ReturnType<typeof buildApp>>

  afterEach(async () => { await server?.app.close() })

  it('returns a list of registered transformers', async () => {
    server = await buildApp()
    const res = await server.app.inject({ method: 'GET', url: '/api/transformers' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('transformers')
    expect(Array.isArray(body.transformers)).toBe(true)
  })

  it('each transformer has a name field', async () => {
    server = await buildApp()
    const res = await server.app.inject({ method: 'GET', url: '/api/transformers' })
    const { transformers } = res.json()
    for (const t of transformers) {
      expect(typeof t.name).toBe('string')
      expect(t.name.length).toBeGreaterThan(0)
    }
  })

  it('includes built-in transformers', async () => {
    server = await buildApp()
    const res = await server.app.inject({ method: 'GET', url: '/api/transformers' })
    const names: string[] = res.json().transformers.map((t: any) => t.name)
    expect(names).toContain('Anthropic')
  })
})
