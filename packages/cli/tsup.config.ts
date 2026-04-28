import { defineConfig } from 'tsup';
import * as path from 'path';
import * as fs from 'fs';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  dts: false,
  sourcemap: true,
  minify: true,
  treeshake: true,
  bundle: true,
  outDir: 'dist',
  external: [
    'jsonc-parser',
    'json5',
    '@inquirer/prompts',
    '@inquirer/input',
    '@inquirer/confirm',
    '@inquirer/select',
    '@inquirer/password',
    '@inquirer/checkbox',
    '@inquirer/editor',
    '@inquirer/core',
    'openurl',
  ],
  onSuccess: async () => {
    const cliDistDir = path.resolve(__dirname, 'dist');
    const rootDistDir = path.resolve(__dirname, '../..', 'dist');

    const tiktokenSource = path.resolve(__dirname, '../server/dist/tiktoken_bg.wasm');
    const tiktokenDest = path.join(cliDistDir, 'tiktoken_bg.wasm');
    if (fs.existsSync(tiktokenSource)) {
      fs.copyFileSync(tiktokenSource, tiktokenDest);
      console.log('✓ tiktoken_bg.wasm copied to CLI dist');
    } else {
      console.warn('⚠ tiktoken_bg.wasm not found in server dist');
    }

    const uiSource = path.resolve(__dirname, '../ui/dist/index.html');
    const uiDest = path.join(cliDistDir, 'index.html');
    if (fs.existsSync(uiSource)) {
      fs.copyFileSync(uiSource, uiDest);
      console.log('✓ index.html copied to CLI dist');
    } else {
      console.warn('⚠ index.html not found in UI dist');
    }

    if (fs.existsSync(rootDistDir)) {
      fs.rmSync(rootDistDir, { recursive: true, force: true });
    }
    fs.cpSync(cliDistDir, rootDistDir, { recursive: true });
    console.log('✓ CLI dist mirrored to root dist/');
  },
});
