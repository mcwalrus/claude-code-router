import { defineConfig } from 'tsup';
import { pathAliasPlugin } from './scripts/esbuild-plugin-path-alias';
import * as path from 'path';

const baseUrl = path.resolve(__dirname);

export default defineConfig({
  splitting: false,
  entry: {
    server: 'src/server.ts',
  },
  format: ['cjs', 'esm'],
  outDir: 'dist',
  outExtension: (ctx) => {
    return ctx.format === 'esm' ? { js: '.mjs' } : { js: '.cjs' };
  },
  platform: 'node',
  target: 'node20',
  dts: false,
  sourcemap: true,
  minify: true,
  treeshake: true,
  bundle: true,
  esbuildOptions(options) {
    options.plugins = [
      ...(options.plugins || []),
      pathAliasPlugin({
        alias: { '@/*': 'src/*' },
        baseUrl,
      }),
    ];
  },
  external: [
    'fastify',
    'dotenv',
    '@fastify/cors',
    'undici',
    'tiktoken',
    '@CCR/shared',
    'lru-cache',
    'prom-client',
  ],
});
