import { defineConfig } from 'tsup';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export default defineConfig({
  entry: ['src/index.ts', 'src/api-schemas.ts'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  dts: true,
  sourcemap: true,
  minify: true,
  treeshake: true,
  bundle: true,
  outDir: 'dist',
  esbuildOptions(options) {
    options.mainFields = ['module', 'main'];
  },
  external: [
    '@fastify/multipart',
    '@fastify/static',
    '@mcwalrus/llms',
    'adm-zip',
    'dotenv',
    'json5',
    'jsonc-parser',
    'lru-cache',
    'rotating-file-stream',
    'shell-quote',
    'tiktoken',
    'uuid',
  ],
  noExternal: ['@mcwalrus/llms'],
  onSuccess: async () => {
    const tiktokenSource = path.resolve(__dirname, 'node_modules/tiktoken/tiktoken_bg.wasm');
    const tiktokenDest = path.resolve(__dirname, 'dist/tiktoken_bg.wasm');
    if (fs.existsSync(tiktokenSource)) {
      fs.copyFileSync(tiktokenSource, tiktokenDest);
      console.log('✓ tiktoken_bg.wasm copied');
    } else {
      console.warn('⚠ tiktoken_bg.wasm not found');
    }

    try {
      execSync('node scripts/gen-openapi.js', {
        cwd: path.resolve(__dirname, '../..'),
        stdio: 'inherit',
      });
    } catch (e) {
      console.warn('⚠ OpenAPI spec generation failed:', e);
    }
  },
});
