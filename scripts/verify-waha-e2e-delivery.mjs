import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read environment from .env.otp.production.local
const envContent = fs.readFileSync(path.resolve(__dirname, '../.env.otp.production.local'), 'utf8');
function getEnv(key) {
  const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : undefined;
}

const SUPABASE_URL = getEnv('SUPABASE_URL') || 'https://qsuvtcezffomtwzwyrso.supabase.co';
const SUPABASE_ANON_KEY = getEnv('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');
const TEST_PHONE = '9972967530'; // Authorized pilot test recipient (+919972967530)

if (!SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  console.log('=== WORK PACKAGE D: CONTROLLED PILOT DISPATCH VERIFICATION ===\n');
  console.log(`Target Function: ${SUPABASE_URL}/functions/v1/otp-dispatch`);
  console.log(`Purpose: SIGNUP_VERIFY`);
  console.log(`Recipient: ${TEST_PHONE} (Baskar Loganathan - Authorized Pilot Handset)\n`);

  const startTime = new Date();
  console.log(`[1] Dispatching controlled OTP request at ${startTime.toISOString()}...`);

  const dispatchUrl = `${SUPABASE_URL}/functions/v1/otp-dispatch`;
  const dispatchRes = await fetch(dispatchUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      purpose: 'SIGNUP_VERIFY',
      identifier: TEST_PHONE,
    }),
  });

  const durationMs = Date.now() - startTime.getTime();
  const resStatus = dispatchRes.status;
  const resHeaders = {
    'sb-request-id': dispatchRes.headers.get('sb-request-id'),
    'cf-ray': dispatchRes.headers.get('cf-ray'),
    'x-deno-execution-id': dispatchRes.headers.get('x-deno-execution-id'),
  };
  const resBody = await dispatchRes.json();

  console.log(`[2] Dispatch Response received in ${durationMs}ms:`);
  console.log(`    HTTP Status: ${resStatus}`);
  console.log(`    Response Body:`, JSON.stringify(resBody));
  console.log(`    Headers:`, resHeaders);

  // Security Invariant 1: No code leaked in response
  const leakCheck = resBody.code === undefined && resBody.otp_code === undefined;
  console.log(`\n[3] Security Invariant 1 (Zero code leakage in response): ${leakCheck ? 'PASSED' : 'FAILED'}`);

  // Inspect Database Record
  console.log(`\n[4] Querying database for hashed OTP record...`);
  const { data: dbRecords, error: dbErr } = await serviceClient
    .from('signup_verification_otps')
    .select('phone, otp_code, otp_code_hash, otp_salt, attempt_count, expires_at, created_at')
    .eq('phone', '91' + TEST_PHONE);

  let record = dbRecords?.[0];
  if (!record) {
    const fallback = await serviceClient
      .from('signup_verification_otps')
      .select('phone, otp_code, otp_code_hash, otp_salt, attempt_count, expires_at, created_at')
      .eq('phone', TEST_PHONE);
    record = fallback.data?.[0];
  }

  if (record) {
    console.log(`    Phone stored: ${record.phone}`);
    console.log(`    Plaintext otp_code column: ${record.otp_code === null ? 'NULL (PASSED: Not stored in plaintext)' : 'LEAKED'}`);
    console.log(`    Hash present: ${record.otp_code_hash ? 'YES' : 'NO'}`);
    console.log(`    Salt present: ${record.otp_salt ? 'YES' : 'NO'}`);
    console.log(`    Attempt count: ${record.attempt_count}`);
    console.log(`    Expires at: ${record.expires_at}`);
  } else {
    console.log(`    DB record lookup error / not found:`, dbErr);
  }

  // Security Invariant 2: Test invalid verification attempt
  console.log(`\n[5] Testing invalid OTP verification rejection...`);
  const { data: invalidVerify, error: invalidErr } = await serviceClient.rpc('verify_profile_verification_otp', {
    p_phone: record?.phone || TEST_PHONE,
    p_otp_code: '00000000',
  });
  console.log(`    RPC Result for code '00000000':`, invalidVerify || invalidErr);
  const invalidRejected = invalidVerify?.ok === false;
  console.log(`    Invalid Code Rejected: ${invalidRejected ? 'PASSED' : 'FAILED'}`);

  // Save evidence output
  const evidence = {
    testExecutedAt: startTime.toISOString(),
    durationMs,
    dispatchStatus: resStatus,
    dispatchHeaders: resHeaders,
    dispatchBody: resBody,
    securityInvariants: {
      zeroCodeLeakageInResponse: leakCheck,
      plaintextNotStoredInDb: record?.otp_code === null,
      invalidCodeRejected: invalidRejected,
    },
    databaseRecord: {
      phone: record?.phone,
      otpCodePlaintext: record?.otp_code,
      hasHash: !!record?.otp_code_hash,
      hasSalt: !!record?.otp_salt,
      expiresAt: record?.expires_at,
    },
  };

  fs.writeFileSync(
    path.resolve(__dirname, '../OTP Golden Reconstruction/WAHA_CONTROLLED_PILOT_DISPATCH_EVIDENCE.json'),
    JSON.stringify(evidence, null, 2)
  );

  console.log(`\nEvidence written to OTP Golden Reconstruction/WAHA_CONTROLLED_PILOT_DISPATCH_EVIDENCE.json`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
