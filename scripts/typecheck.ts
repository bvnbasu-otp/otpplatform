/**
 * =============================================================================
 * OTP Platform — Workspace Typecheck Engine
 * =============================================================================
 * Performs strict TypeScript type verification across all workspace packages:
 *   1. packages/domain
 *   2. packages/database
 *   3. packages/services
 *   4. apps/web
 * =============================================================================
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const packages = [
  { name: '@otp/domain', config: 'packages/domain/tsconfig.json' },
  { name: '@otp/database', config: 'packages/database/tsconfig.json' },
  { name: '@otp/services', config: 'packages/services/tsconfig.json' },
  { name: '@otp/web', config: 'apps/web/tsconfig.json' },
];

function resolveTsc(): string {
  const localTsc = path.resolve('node_modules/typescript/bin/tsc');
  if (fs.existsSync(localTsc)) {
    return `"${process.execPath}" "${localTsc}"`;
  }
  return 'tsc';
}

console.log('\n=================================================================');
console.log('  🛡️  OTP PLATFORM — WORKSPACE TYPESCRIPT COMPILATION CHECK');
console.log('=================================================================');

const tscCmd = resolveTsc();
let hasErrors = false;

for (const pkg of packages) {
  const startTime = Date.now();
  process.stdout.write(`⏳ Typechecking ${pkg.name}... `);

  try {
    execSync(`${tscCmd} --noEmit -p "${pkg.config}"`, {
      stdio: 'pipe',
      encoding: 'utf8',
      env: process.env,
    });
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\x1b[32mPASSED\x1b[0m (${duration}s)`);
  } catch (err: any) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\x1b[31mFAILED\x1b[0m (${duration}s)`);
    console.error(err.stdout || err.stderr || err.message);
    hasErrors = true;
  }
}

if (hasErrors) {
  console.log('\n\x1b[31m✕ Typecheck failed. Please fix TypeScript errors above.\x1b[0m\n');
  process.exit(1);
} else {
  console.log('\n\x1b[32m✓ All workspace packages passed TypeScript typecheck cleanly.\x1b[0m\n');
  process.exit(0);
}
