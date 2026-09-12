import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname),
  resolve: {
    alias: {
      '@otp/domain': resolve(__dirname, '../domain/src/index.ts'),
      '@otp/database': resolve(__dirname, '../database/src/index.ts'),
    },
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
