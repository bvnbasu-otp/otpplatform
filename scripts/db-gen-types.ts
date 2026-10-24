/**
 * Cross-platform wrapper for type generation from a positively identified
 * disposable database. It deliberately has no `--local` fallback because
 * port 54322 may belong to a retained stack.
 *
 * PowerShell's `>` redirection writes UTF-16 by default and merges stderr with
 * `2>&1`, both of which corrupt the generated file. This script spawns the
 * CLI, captures stdout only, and writes UTF-8 without a BOM regardless of OS.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const OUT = resolve('packages/database/src/generated/supabase.ts');

export function parseDisposableDbUrl(argv: string[]): string {
  if (argv.length !== 2 || argv[0] !== '--db-url' || !argv[1]) {
    throw new Error('Usage: db-gen-types.ts --db-url <isolated disposable PostgreSQL URL>');
  }
  const parsed = new URL(argv[1]);
  const port = Number(parsed.port);
  if (
    parsed.protocol !== 'postgresql:'
    || !['127.0.0.1', 'localhost'].includes(parsed.hostname)
    || !Number.isInteger(port)
    || port < 55000
    || port > 59999
    || parsed.pathname !== '/postgres'
    || (parsed.search !== '' && parsed.search !== '?sslmode=disable')
    || parsed.hash
  ) {
    throw new Error('Type generation requires an isolated loopback disposable database on ports 55000-59999');
  }
  return parsed.toString();
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { shell: false });
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

async function main(): Promise<void> {
  try {
    const args = process.argv.slice(2);
    const dbUrl = parseDisposableDbUrl(args[0] === '--' ? args.slice(1) : args);
    const types = await run('supabase', ['gen', 'types', 'typescript', '--db-url', dbUrl]);
    const trimmed = types
      .replace(/^\uFEFF/, '')
      .trimStart()
      .replace(/[ \t]+$/gm, '');
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, trimmed, { encoding: 'utf8' });
    console.log(`Wrote ${OUT} (${trimmed.length} bytes)`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

void main();
