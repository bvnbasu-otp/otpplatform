import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

console.log('\n🔄 Resetting OTP demo to walkthrough-ready state...\n');

const start = Date.now();

try {
  execSync('npx tsx scripts/demo/seed-demo.ts ready', {
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

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n✅ Demo reset complete in ${elapsed}s — ready for walkthrough\n`);
console.log('Login: demo@durga-rainbow.manager / DemoManager2026!\n');
