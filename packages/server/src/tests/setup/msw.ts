import { setupServer } from 'msw/node'
import { allHandlers } from '../handlers/providers'

export const mswServer = setupServer(...allHandlers)
