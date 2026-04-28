import { describe, it, expect } from 'vitest'
import { calculateTokenCount } from './router'

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
