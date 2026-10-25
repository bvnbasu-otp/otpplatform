/**
 * OTP Platform — Supabase Cloud 24/7 Keep-Alive & Health Ping
 *
 * Runs on a recurring schedule (e.g., via GitHub Actions or Windows Task Scheduler)
 * to prevent Supabase Cloud Free Tier 7-day inactivity database pauses.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL;

const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

async function runKeepAlive() {
  const timestamp = new Date().toISOString();
  console.log('=================================================================');
  console.log('  OTP PLATFORM — SUPABASE CLOUD KEEP-ALIVE HEARTBEAT');
  console.log('=================================================================');
  console.log(`Timestamp : ${timestamp}`);
  console.log(`Target URL: ${SUPABASE_URL}`);
  console.log('');

  const startTime = Date.now();
  let successCount = 0;

  // 1. PostgREST REST Heartbeat Ping
  try {
    const restUrl = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/platform_heartbeat`;
    const res = await fetch(restUrl, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });

    const elapsed = Date.now() - startTime;
    if (res.ok) {
      const data = await res.json();
      console.log(`[PASS] PostgREST Database Heartbeat (${elapsed}ms) -> HTTP ${res.status}`);
      console.log(`       Heartbeat: ${JSON.stringify(data)}`);
      successCount++;
    } else {
      console.warn(`[WARN] PostgREST returned HTTP ${res.status}: ${await res.text()}`);
    }
  } catch (err: unknown) {
    console.error(`[FAIL] PostgREST Ping Error: ${errorMessage(err)}`);
  }

  // 2. Auth Service Liveness Ping
  try {
    const authStart = Date.now();
    const authUrl = `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/health`;
    const authRes = await fetch(authUrl, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
      },
    });
    const authElapsed = Date.now() - authStart;
    if (authRes.ok) {
      console.log(`[PASS] GoTrue Auth Engine (${authElapsed}ms) -> HTTP ${authRes.status}`);
      successCount++;
    } else {
      console.warn(`[WARN] GoTrue Auth returned HTTP ${authRes.status}`);
    }
  } catch (err: unknown) {
    console.error(`[FAIL] Auth Health Check Error: ${errorMessage(err)}`);
  }

  // 3. JS Client RPC / Query Assertion
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await client
      .from('suppliers')
      .select('id, name')
      .limit(1);

    if (error) {
      console.warn(`[INFO] Public supplier query notice: ${error.message}`);
    } else {
      console.log(`[PASS] Supabase JS Client Query -> Active connection verified (${data?.length ?? 0} rows retrieved)`);
      successCount++;
    }
  } catch (err: unknown) {
    console.error(`[FAIL] Supabase JS Client Error: ${errorMessage(err)}`);
  }

  const totalElapsed = Date.now() - startTime;
  console.log('');
  console.log('=================================================================');
  if (successCount > 0) {
    console.log(`  HEARTBEAT SUCCESSFUL: Database is warm and active! (Total: ${totalElapsed}ms)`);
    console.log('  Inactivity timer reset. Automatic pause prevented.');
    console.log('=================================================================');
    process.exit(0);
  } else {
    console.error('  HEARTBEAT FAILED: Could not reach Supabase Cloud endpoints.');
    console.log('=================================================================');
    process.exit(1);
  }
}

runKeepAlive();
