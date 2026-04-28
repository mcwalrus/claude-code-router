import { describe, it, expect } from 'vitest'
import { SSEParserTransform } from './SSEParser.transform'

async function parseSSE(chunks: string[]): Promise<any[]> {
  const transform = new SSEParserTransform()
  const writer = transform.writable.getWriter()
  const reader = transform.readable.getReader()

  const events: any[] = []
  const reading = (async () => {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      events.push(value)
    }
  })()

  for (const chunk of chunks) {
    await writer.write(chunk)
  }
  await writer.close()
  await reading

  return events
}

describe('SSEParserTransform', () => {
  it('parses a single event with event and data fields', async () => {
    const input = 'event: message\ndata: {"type":"text"}\n\n'
    const events = await parseSSE([input])
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('message')
    expect(events[0].data).toEqual({ type: 'text' })
  })

  it('parses multiple events separated by blank lines', async () => {
    const input = 'event: start\ndata: {"type":"start"}\n\nevent: end\ndata: {"type":"end"}\n\n'
    const events = await parseSSE([input])
    expect(events).toHaveLength(2)
    expect(events[0].event).toBe('start')
    expect(events[1].event).toBe('end')
  })

  it('handles [DONE] sentinel as done type', async () => {
    const input = 'event: message\ndata: [DONE]\n\n'
    const events = await parseSSE([input])
    expect(events[0].data).toEqual({ type: 'done' })
  })

  it('handles chunked input split across writes', async () => {
    const chunks = ['event: msg\ndata: {"val', '":1}\n\n']
    const events = await parseSSE(chunks)
    expect(events).toHaveLength(1)
    expect(events[0].data).toEqual({ val: 1 })
  })

  it('parses id and retry fields', async () => {
    const input = 'id: 42\nretry: 3000\nevent: ping\ndata: {}\n\n'
    const events = await parseSSE([input])
    expect(events[0].id).toBe('42')
    expect(events[0].retry).toBe(3000)
  })

  it('records parse error for malformed JSON without throwing', async () => {
    const input = 'event: bad\ndata: not-json\n\n'
    const events = await parseSSE([input])
    expect(events[0].data.error).toBe('JSON parse failed')
    expect(events[0].data.raw).toBe('not-json')
  })
})
