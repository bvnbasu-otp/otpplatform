import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname),
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@otp/domain': resolve(__dirname, '../../packages/domain/src/index.ts'),
      '@otp/database': resolve(__dirname, '../../packages/database/src/index.ts'),
      '@otp/services': resolve(__dirname, '../../packages/services/src/index.ts'),
      '@otp/messaging': resolve(__dirname, '../../supabase/functions/_shared/messaging/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    maxWorkers: 1,
    isolate: true,
  },
});
