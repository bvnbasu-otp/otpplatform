/**
 * Cross-platform runner for the Deno-side edge-function tests.
 *
 * Invoked from `pnpm test:functions`. Behaves the same on Windows, macOS and
 * Linux: if Deno is installed, it runs `deno task test` in the Supabase
 * functions directory and exits with that status. If Deno is not installed,
 * it prints an install hint and exits 0 — CI can require Deno by setting
 * `OTP_REQUIRE_DENO=1`, which flips the miss to a non-zero exit.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const FUNCTIONS_DIR = resolve('supabase/functions');
const REQUIRE_DENO = process.env.OTP_REQUIRE_DENO === '1';

function hasDeno(): Promise<boolean> {
  const which = process.platform === 'win32' ? 'where.exe' : 'which';
  return new Promise((res) => {
    const child = spawn(which, ['deno'], { stdio: 'ignore' });
    child.on('exit', (code) => res(code === 0));
    child.on('error', () => res(false));
  });
}

function main(): Promise<void> {
  if (!existsSync(FUNCTIONS_DIR)) {
    console.error(`Functions dir not found: ${FUNCTIONS_DIR}`);
    process.exit(1);
  }

  return hasDeno().then((deno) => {
    if (!deno) {
      const message =
        'Deno is not installed. Install from '
        + 'https://docs.deno.com/runtime/getting_started/installation/ '
        + 'to run the edge-function test suite.';
      if (REQUIRE_DENO) {
        console.error(message);
        process.exit(1);
      }
      console.warn(`${message} Skipping.`);
      return;
    }

    const child = spawn('deno', ['task', 'test'], {
      cwd: FUNCTIONS_DIR,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('exit', (code) => process.exit(code ?? 1));
    child.on('error', (err) => {
      console.error(err.message);
      process.exit(1);
    });
  });
}

main();
