import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  dts: true,
  sourcemap: true,
  minify: true,
  treeshake: true,
  bundle: true,
  external: [
    '@sinclair/typebox',
    'adm-zip',
    'archiver',
    'json5',
    'jsonc-parser',
  ],
  outDir: 'dist',
});
