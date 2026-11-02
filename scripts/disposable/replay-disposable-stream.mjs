/**
 * ============================================================================
 * OTP NEXT / X2O — DISPOSABLE DATABASE RECONSTRUCTION
 * ACTION 4: ISOLATED DISPOSABLE REPLAY HARNESS
 * ============================================================================
 * File: scripts/disposable/replay-disposable-stream.mjs
 * Purpose: Spawns an isolated local Docker container (PostgreSQL 15),
 *          waits for Supabase internal startup to complete, disables internal
 *          schema-cache event triggers, applies custom platform schemas,
 *          replays all 331 sanitized migrations sequentially, applies canonical
 *          reference fixtures, and executes the catalog verification suite.
 *
 * Security & Isolation:
 *   - Docker network mode: `--network none` (strictly 0 network egress).
 *   - Communication: `docker exec -i` (no external or host port exposure).
 *   - Ephemeral: Container is destroyed automatically upon test completion.
 * ============================================================================
 */

import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const CONTAINER_NAME = 'otp_disposable_reconstruction_pg15';
const IMAGE_TAG = 'supabase/postgres:15.1.1.78';
const MIGRATIONS_DIR = path.join(ROOT_DIR, 'build', 'disposable-migrations');
const BOOTSTRAP_SQL = path.join(
  ROOT_DIR,
  'docs',
  'otp-next',
  'tell',
  'stage-b',
  'b3',
  'evidence',
  'disposable-design',
  'bootstrap',
  '00-supabase-platform-bootstrap.sql'
);
const FIXTURE_SQL = path.join(
  ROOT_DIR,
  'docs',
  'otp-next',
  'tell',
  'stage-b',
  'b3',
  'evidence',
  'disposable-design',
  'fixtures',
  '01-canonical-reference-data.sql'
);
const VERIFY_SQL = path.join(
  ROOT_DIR,
  'docs',
  'otp-next',
  'tell',
  'stage-b',
  'b3',
  'evidence',
  'disposable-design',
  'tests',
  'verify-reconstruction-postconditions.sql'
);

function runCommand(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts });
}

function executePsqlFile(filePath, user = 'postgres') {
  const content = fs.readFileSync(filePath, 'utf8');
  return new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      ['exec', '-i', '-e', 'PGPASSWORD=postgres', CONTAINER_NAME, 'psql', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('close', code => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Exit code ${code}:\n${stderr}\n${stdout}`));
      }
    });

    child.stdin.write(content);
    child.stdin.end();
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForPostgres() {
  console.log('Waiting for Supabase PostgreSQL in isolated container to complete internal init...');
  for (let i = 0; i < 60; i++) {
    try {
      const logs = runCommand(`docker logs ${CONTAINER_NAME}`);
      if (logs.includes('PostgreSQL init process complete')) {
        console.log('Supabase PostgreSQL init process complete. Waiting 2s for listener...');
        await sleep(2000);
        return;
      }
    } catch (_) {}
    await sleep(1000);
  }
  throw new Error('Timed out waiting for PostgreSQL container initialization.');
}

async function main() {
  console.log('============================================================');
  console.log('STARTING DISPOSABLE DATABASE REPLAY (GATE A2)');
  console.log('============================================================');
  console.log(`Image: ${IMAGE_TAG}`);
  console.log(`Network Mode: --network none (100% egress denial)`);

  // 1. Cleanup any previous test container
  try {
    runCommand(`docker rm -f ${CONTAINER_NAME}`);
  } catch (_) {}

  // 2. Launch container
  console.log('\nLaunching isolated container...');
  runCommand(
    `docker run -d --name ${CONTAINER_NAME} --network none -e POSTGRES_PASSWORD=postgres ${IMAGE_TAG}`
  );

  try {
    await waitForPostgres();

    // 3. Disable internal pg_graphql triggers to avoid DDL OID locks during rapid migration replay
    console.log('\nDisabling internal pg_graphql triggers during migration replay...');
    runCommand(
      `docker exec -e PGPASSWORD=postgres ${CONTAINER_NAME} psql -U supabase_admin -d postgres -c "ALTER EVENT TRIGGER graphql_watch_ddl DISABLE; ALTER EVENT TRIGGER graphql_watch_drop DISABLE;"`
    );

    // 4. Apply platform bootstrap extensions & schemas
    console.log('\nApplying Supabase Platform Bootstrap Contract...');
    await executePsqlFile(BOOTSTRAP_SQL, 'supabase_admin');
    console.log('Bootstrap applied successfully.');

    // 5. Replay the 331 generated migrations
    console.log('\nReplaying 331 Sanitized Migrations sequentially...');
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let count = 0;
    const startTime = Date.now();

    for (const file of files) {
      count++;
      const filePath = path.join(MIGRATIONS_DIR, file);
      process.stdout.write(`\r[${count}/331] Applying ${file}...`);
      await executePsqlFile(filePath, 'postgres');
    }
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n\nAll 331 migrations applied successfully in ${elapsedSec}s!`);

    // 6. Apply canonical reference data
    console.log('\nApplying Canonical Reference Fixtures (12 roles, 17 categories, 23 capability mappings)...');
    await executePsqlFile(FIXTURE_SQL, 'postgres');
    console.log('Canonical reference fixtures applied successfully.');

    // 7. Run Catalog Postcondition Verification Suite
    console.log('\nExecuting Catalog Postcondition Verification Suite...');
    const verifyRes = await executePsqlFile(VERIFY_SQL, 'postgres');
    console.log(verifyRes.stdout || verifyRes.stderr);

    console.log('\n============================================================');
    console.log('DISPOSABLE DATABASE REPLAY & VERIFICATION COMPLETE: PASS');
    console.log('============================================================\n');

  } finally {
    // 8. Cleanup ephemeral container
    console.log('Cleaning up ephemeral container...');
    try {
      runCommand(`docker rm -f ${CONTAINER_NAME}`);
      console.log('Container destroyed. Zero persistent resources retained.');
    } catch (e) {
      console.warn('Cleanup warning:', e.message);
    }
  }
}

main().catch(err => {
  console.error('\nFATAL REPLAY ERROR:', err);
  try {
    runCommand(`docker rm -f ${CONTAINER_NAME}`);
  } catch (_) {}
  process.exit(1);
});
