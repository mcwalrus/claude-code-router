import { describe, it, expect } from 'vitest'
import { sanitizeConfig, generateEnvVarName } from './sensitiveFields'

describe('generateEnvVarName', () => {
  it('joins prefix and field with underscore', () => {
    expect(generateEnvVarName('provider', 'deepseek', 'api_key')).toBe('DEEPSEEK_API_KEY')
  })

  it('uppercases and replaces non-alphanumeric chars', () => {
    expect(generateEnvVarName('transformer', 'my-transformer', 'secret')).toBe('MY_TRANSFORMER_SECRET')
  })

  it('avoids duplicate when prefix equals field', () => {
    expect(generateEnvVarName('global', 'API_KEY', 'api_key')).toBe('API_KEY')
  })
})

describe('sanitizeConfig', () => {
  it('replaces api_key string values with env var placeholder', async () => {
    const config = { api_key: 'sk-secret123' }
    const { sanitizedConfig, sanitizedCount } = await sanitizeConfig(config)
    expect(sanitizedConfig.api_key).toMatch(/^\$\{.+\}$/)
    expect(sanitizedCount).toBe(1)
  })

  it('leaves value unchanged when already an env var placeholder', async () => {
    const config = { api_key: '${MY_API_KEY}' }
    const { sanitizedConfig, sanitizedCount } = await sanitizeConfig(config)
    expect(sanitizedConfig.api_key).toBe('${MY_API_KEY}')
    expect(sanitizedCount).toBe(0)
  })

  it('leaves value unchanged when already a bare $VAR placeholder', async () => {
    const config = { api_key: '$MY_API_KEY' }
    const { sanitizedConfig, sanitizedCount } = await sanitizeConfig(config)
    expect(sanitizedConfig.api_key).toBe('$MY_API_KEY')
    expect(sanitizedCount).toBe(0)
  })

  it('does not redact non-sensitive fields', async () => {
    const config = { name: 'deepseek', baseUrl: 'https://api.deepseek.com' }
    const { sanitizedConfig, sanitizedCount } = await sanitizeConfig(config)
    expect(sanitizedConfig.name).toBe('deepseek')
    expect(sanitizedConfig.baseUrl).toBe('https://api.deepseek.com')
    expect(sanitizedCount).toBe(0)
  })

  it('recurses into nested objects', async () => {
    const config = { provider: { api_key: 'real-key', name: 'openai' } }
    const { sanitizedConfig, sanitizedCount } = await sanitizeConfig(config)
    expect(sanitizedConfig.provider.api_key).toMatch(/^\$\{.+\}$/)
    expect(sanitizedConfig.provider.name).toBe('openai')
    expect(sanitizedCount).toBe(1)
  })

  it('recurses into arrays', async () => {
    const config = {
      Providers: [
        { name: 'deepseek', api_key: 'sk-abc' },
        { name: 'openai', api_key: 'sk-xyz' },
      ],
    }
    const { sanitizedConfig, sanitizedCount } = await sanitizeConfig(config)
    expect(sanitizedConfig.Providers[0].api_key).toMatch(/^\$\{.+\}$/)
    expect(sanitizedConfig.Providers[1].api_key).toMatch(/^\$\{.+\}$/)
    expect(sanitizedCount).toBe(2)
  })

  it('does not mutate the original config', async () => {
    const config = { api_key: 'keep-me' }
    await sanitizeConfig(config)
    expect(config.api_key).toBe('keep-me')
  })
})
