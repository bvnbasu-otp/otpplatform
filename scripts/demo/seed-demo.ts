import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafeEnvironment } from './env-guard';

assertSafeEnvironment('seed-demo');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

function run(cmd: string) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit', env: process.env });
}

function resolveSql(filePath: string): string {
  if (!existsSync(filePath)) throw new Error(`Seed file not found: ${filePath}`);
  let content = readFileSync(filePath, 'utf8');
  const dir = dirname(filePath);
  return content.replace(/^\\ir\s+([^\r\n]+)$/gm, (_, relPath) => {
    const target = resolve(dir, relPath.trim());
    return resolveSql(target);
  });
}

function applySql(file: string) {
  // Support both new supabase/seeds/ hierarchy and legacy flat supabase/ paths
  let path = resolve(root, 'supabase', file);
  if (!existsSync(path)) {
    const seedPath = resolve(root, 'supabase/seeds', file);
    if (existsSync(seedPath)) {
      path = seedPath;
    }
  }
  const sql = resolveSql(path);
  try {
    const dbUrl =
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
    execSync(`psql "${dbUrl}" -v ON_ERROR_STOP=1`, {
      cwd: root,
      input: sql,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  } catch {
    // Fallback to docker exec if psql CLI is not on PATH
    execSync(
      `docker exec -i supabase_db_otp-local psql -U postgres -d postgres -v ON_ERROR_STOP=1`,
      {
        cwd: root,
        input: sql,
        stdio: ['pipe', 'inherit', 'inherit'],
      }
    );
  }
}

const mode = (process.argv[2] ?? 'ready') as 'ready' | 'complete';

const seedFile =
  mode === 'complete'
    ? (existsSync(resolve(root, 'supabase/seeds/02_demo_durga_rainbow/complete.sql'))
        ? 'seeds/02_demo_durga_rainbow/complete.sql'
        : 'seed_demo_complete.sql')
    : (existsSync(resolve(root, 'supabase/seeds/02_demo_durga_rainbow/ready.sql'))
        ? 'seeds/02_demo_durga_rainbow/ready.sql'
        : 'seed_demo_ready.sql');

const authSeedFile = existsSync(resolve(root, 'supabase/seeds/02_demo_durga_rainbow/auth.sql'))
  ? 'seeds/02_demo_durga_rainbow/auth.sql'
  : 'seed_demo_auth.sql';

console.log(`\n🌱 Seeding OTP demo (${mode}) — Durga Rainbow Community\n`);

try {
  applySql(authSeedFile);
  applySql(seedFile);
  console.log(`\n✅ Demo seed applied: auth + ${seedFile}\n`);
} catch (err: any) {
  console.error('\n❌ Seed failed:', err?.message || err);
  console.error(
    '\nEnsure Supabase is running and schema is initialized: pnpm db:start && pnpm db:reset\n',
  );
  process.exit(1);
}
