import { describe, it, expect } from 'vitest'
import { validateConfig } from './config-schema'

describe('validateConfig — Router (singular)', () => {
  it('accepts a valid Router config', () => {
    const result = validateConfig({
      Router: { default: 'anthropic,claude-sonnet-4-5' },
    })
    expect(result.valid).toBe(true)
  })

  it('accepts Router with all scenario keys', () => {
    const result = validateConfig({
      Router: {
        default: 'anthropic,claude-sonnet-4-5',
        background: 'groq,llama-3.1-8b-instant',
        think: 'openrouter,anthropic/claude-opus-4',
        longContext: 'openrouter,anthropic/claude-opus-4',
        webSearch: 'openrouter,anthropic/claude-opus-4:online',
      },
    })
    expect(result.valid).toBe(true)
  })

  it('accepts an empty object when neither Router nor Routers is set', () => {
    expect(validateConfig({}).valid).toBe(true)
  })
})

describe('validateConfig — Routers (plural, header-based)', () => {
  it('accepts a valid Routers config with a default key', () => {
    const result = validateConfig({
      Routers: {
        default: { default: 'anthropic,claude-sonnet-4-5' },
      },
    })
    expect(result.valid).toBe(true)
  })

  it('accepts Routers with multiple named profiles', () => {
    const result = validateConfig({
      Routers: {
        default: { default: 'anthropic,claude-sonnet-4-5' },
        fast: { default: 'groq,llama-3.1-8b-instant' },
        powerful: {
          default: 'openrouter,anthropic/claude-opus-4',
          think: 'openrouter,anthropic/claude-opus-4',
        },
      },
    })
    expect(result.valid).toBe(true)
  })

  it('rejects Routers without a default key', () => {
    const result = validateConfig({
      Routers: {
        fast: { default: 'groq,llama-3.1-8b-instant' },
      },
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('default'))).toBe(true)
  })

  it('rejects Routers where default is not a Router object', () => {
    const result = validateConfig({
      Routers: {
        default: 'not-an-object',
      },
    })
    expect(result.valid).toBe(false)
  })

  it('rejects Routers where a named profile value is not a Router object', () => {
    const result = validateConfig({
      Routers: {
        default: { default: 'anthropic,claude-sonnet-4-5' },
        fast: 'not-an-object',
      },
    })
    expect(result.valid).toBe(false)
  })
})

describe('validateConfig — coexistence of Router and Routers', () => {
  it('accepts configs that set both Router and Routers', () => {
    // Both are optional; schema does not enforce mutual exclusion — runtime behaviour does
    const result = validateConfig({
      Router: { default: 'anthropic,claude-sonnet-4-5' },
      Routers: {
        default: { default: 'groq,llama-3.1-8b-instant' },
      },
    })
    expect(result.valid).toBe(true)
  })
})
