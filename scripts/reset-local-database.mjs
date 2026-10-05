/**
 * Local test-database reset for supabase_db_otp-local.
 * Applies migrations and seeds, then restores the storage upload arbiter
 * that the storage schema no longer creates. Does not contact hosted projects.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, CI: 'true' };

const reset = spawnSync('supabase', ['db', 'reset'], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: true,
});
if (reset.status !== 0) {
  process.exit(reset.status ?? 1);
}

const arbiter = spawnSync(process.execPath, [path.join(root, 'scripts', 'ensure-storage-upload-arbiter.mjs')], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(arbiter.status ?? 1);
