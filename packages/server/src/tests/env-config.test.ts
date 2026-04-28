import { describe, it, expect } from 'vitest'
import { loadEnvConfig } from '@CCR/shared'

describe('loadEnvConfig', () => {
  it('parses CCR_PROXY_HOP into PROXY_HOP', () => {
    const cfg = loadEnvConfig({ env: { CCR_PROXY_HOP: 'edge' } })
    expect(cfg.PROXY_HOP).toBe('edge')
  })

  it('omits PROXY_HOP when env var is absent', () => {
    const cfg = loadEnvConfig({ env: {} })
    expect(cfg).not.toHaveProperty('PROXY_HOP')
  })

  it('parses CCR_PROXY_URL alongside CCR_PROXY_HOP', () => {
    const cfg = loadEnvConfig({
      env: { CCR_PROXY_URL: 'http://proxy:8080', CCR_PROXY_HOP: 'dmz' },
    })
    expect(cfg.PROXY_URL).toBe('http://proxy:8080')
    expect(cfg.PROXY_HOP).toBe('dmz')
  })
})
