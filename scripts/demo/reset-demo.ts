import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafeEnvironment } from './env-guard';

assertSafeEnvironment('reset-demo');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

const mode = (process.argv[2] ?? 'ready') as 'ready' | 'complete';
console.log(`\n🔄 Resetting OTP demo to ${mode} state...\n`);

const start = Date.now();

try {
  execSync(`pnpm exec tsx scripts/demo/seed-demo.ts ${mode}`, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, DEMO_MODE: 'true' },
  });
} catch {
  console.log('\n⚠️  Direct tsx failed — trying npx tsx...\n');
  try {
    execSync(`npx tsx scripts/demo/seed-demo.ts ${mode}`, {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, DEMO_MODE: 'true' },
    });
  } catch {
    console.log('\n⚠️  Incremental seed failed — falling back to supabase db reset...\n');
    try {
      execSync('supabase db reset --yes', {
        cwd: root,
        stdio: 'inherit',
        env: process.env,
      });
    } catch {
      console.error(
        '\n❌ Reset failed. Start Supabase: pnpm db:start\n',
      );
      process.exit(1);
    }
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n✅ Demo reset complete in ${elapsed}s — ready for walkthrough\n`);
console.log('Login: demo@durga-rainbow.manager / DemoManager2026!\n');
