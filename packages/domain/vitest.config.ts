import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname),
  resolve: {
    extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.json'],
  },
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        skipLibCheck: true,
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    isolate: false,
  },
});
