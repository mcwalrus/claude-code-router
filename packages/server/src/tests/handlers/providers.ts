import { http, HttpResponse } from 'msw'

// The Anthropic transformer forwards to provider.baseUrl (root), not baseUrl+endPoint.
// MSW must intercept at the base URL path.
export const anthropicHandlers = [
  http.post('https://api.anthropic.com/', () =>
    HttpResponse.json({
      id: 'msg_test_01',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'mocked response' }],
      model: 'claude-sonnet-4-5',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 3 },
    })
  ),
]

export const allHandlers = [...anthropicHandlers]
