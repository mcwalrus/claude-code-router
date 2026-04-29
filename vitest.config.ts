import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@CCR/shared': resolve(__dirname, 'packages/shared/src/index.ts'),
      '@': resolve(__dirname, 'packages/core/src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['packages/*/src/**/*.test.ts'],
  },
})
