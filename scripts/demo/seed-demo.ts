import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  const path = resolve(root, 'supabase', file);
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
  mode === 'complete' ? 'seed_demo_complete.sql' : 'seed_demo_ready.sql';

console.log(`\n🌱 Seeding OTP demo (${mode}) — Durga Rainbow Community\n`);

try {
  applySql('seed_demo_auth.sql');
  applySql(seedFile);
  console.log(`\n✅ Demo seed applied: auth + ${seedFile}\n`);
} catch (err) {
  console.error('\n⚠️  Direct psql failed — trying supabase db execute...\n');
  try {
    run(`supabase db execute --file supabase/${seedFile}`);
    console.log(`\n✅ Demo seed applied via supabase CLI\n`);
  } catch {
    console.error(
      '\n❌ Seed failed. Ensure Supabase is running: pnpm db:start && pnpm db:reset\n',
    );
    process.exit(1);
  }
}
