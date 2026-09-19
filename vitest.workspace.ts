import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'vitest.config.ts',
  'apps/web/vitest.config.ts',
  'packages/domain/vitest.config.ts',
  'packages/services/vitest.config.ts',
  'packages/database/vitest.config.ts',
]);
