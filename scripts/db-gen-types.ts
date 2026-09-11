/**
 * Cross-platform wrapper for `supabase gen types typescript --local`.
 *
 * PowerShell's `>` redirection writes UTF-16 by default and merges stderr with
 * `2>&1`, both of which corrupt the generated file. This script spawns the
 * CLI, captures stdout only, and writes UTF-8 without a BOM regardless of OS.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const OUT = resolve('packages/database/src/generated/supabase.ts');

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { shell: process.platform === 'win32' });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b) => (stdout += b.toString('utf8')));
    child.stderr.on('data', (b) => (stderr += b.toString('utf8')));
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code !== 0) {
        rejectPromise(new Error(`supabase exited with ${code}: ${stderr.trim()}`));
        return;
      }
      resolvePromise(stdout);
    });
  });
}

try {
  const types = await run('supabase', ['gen', 'types', 'typescript', '--local']);
  const trimmed = types.replace(/^\uFEFF/, '').trimStart();
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, trimmed, { encoding: 'utf8' });
  console.log(`Wrote ${OUT} (${trimmed.length} bytes)`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
