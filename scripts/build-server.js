#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Building Server package...');

try {
  const serverDir = path.join(__dirname, '../packages/server');

  // Create dist directory
  const distDir = path.join(serverDir, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Generate type declaration files
  console.log('Generating type declaration files...');
  execSync('tsc --emitDeclarationOnly', {
    stdio: 'inherit',
    cwd: serverDir
  });

  // Build the server application
  console.log('Building server application...');
  execSync('esbuild src/index.ts --bundle --platform=node --main-fields=module,main --minify --tree-shaking=true --outfile=dist/index.js', {
    stdio: 'inherit',
    cwd: serverDir
  });

  // Build api-schemas separately so gen-openapi.js can import it at build time
  console.log('Building API schemas module...');
  execSync('esbuild src/api-schemas.ts --bundle --platform=node --outfile=dist/api-schemas.js', {
    stdio: 'inherit',
    cwd: serverDir
  });

  // Copy the tiktoken WASM file
  console.log('Copying tiktoken WASM file...');
  const tiktokenSource = path.join(__dirname, '../packages/server/node_modules/tiktoken/tiktoken_bg.wasm');
  const tiktokenDest = path.join(__dirname, '../packages/server/dist/tiktoken_bg.wasm');

  if (fs.existsSync(tiktokenSource)) {
    fs.copyFileSync(tiktokenSource, tiktokenDest);
    console.log('Tiktoken WASM file copied successfully!');
  } else {
    console.warn('Warning: tiktoken_bg.wasm not found, skipping...');
  }

  // Generate static OpenAPI spec (requires shared package already built)
  console.log('Generating static OpenAPI spec...');
  execSync(`node ${path.join(__dirname, 'gen-openapi.js')}`, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
  });

  console.log('Server build completed successfully!');
} catch (error) {
  console.error('Server build failed:', error.message);
  process.exit(1);
}
