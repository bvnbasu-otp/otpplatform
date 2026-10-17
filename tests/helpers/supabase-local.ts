import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { Client } from 'pg';
import { catalogAcceptance } from './legal-evidence-fixture';

function generateJwt(role: 'anon' | 'service_role', secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: 'supabase-demo',
      role,
      exp: 1983812996,
    }),
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${sig}`;
}

const SECRET_PROD = 'your-long-production-jwt-secret-min-32-chars!';
const SECRET_CLI = 'super-secret-jwt-token-with-at-least-32-characters-long';

/**
 * Current frozen agreement for signup calls. The version and hash come from
 * the database catalogue, never from a hard-coded draft.
 */
export async function loadCommittedLegalAcceptance(side: 'BUYER' | 'SUPPLIER' = 'BUYER') {
  const client = new Client({
    host: '127.0.0.1',
    port: 54322,
    database: process.env.OTP_PG_DATABASE ?? 'postgres',
    user: 'postgres',
    password: 'postgres',
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    const acceptance = await catalogAcceptance(client, side);
    await client.query('COMMIT');
    return acceptance;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connection already closed the transaction */
    }
    throw error;
  } finally {
    await client.end();
  }
}

/** Removes disposable reviewer evidence. Does not publish or approve legal text. */
export async function removeDisposableLegalEvidence(): Promise<void> {
  const client = new Client({
    host: '127.0.0.1',
    port: 54322,
    database: process.env.OTP_PG_DATABASE ?? 'postgres',
    user: 'postgres',
    password: 'postgres',
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL session_replication_role = replica`);
    await client.query(`DELETE FROM public.legal_agreement_approvals`);
    await client.query(`DELETE FROM public.legal_review_grants`);
    await client.query(`DELETE FROM public.legal_acceptance_archives`);
    await client.query(`DELETE FROM public.legal_document_versions WHERE version <> 'v1.0-20261014'`);
    await client.query(`DELETE FROM public.legal_document_snapshots`);
    await client.query(
      `UPDATE public.legal_document_versions
       SET retired_at = NULL, snapshot_id = NULL, legal_approval_status = 'PENDING_LEGAL_APPROVAL'
       WHERE version = 'v1.0-20261014'`,
    );
    await client.query(
      `UPDATE public.legal_enforcement_config
       SET enforcement_enabled = false, rollout_at = NULL,
           grace_customer_snapshot_id = NULL, grace_supplier_snapshot_id = NULL`,
    );
    await client.query('COMMIT');
  } finally {
    await client.end();
  }
}

export const KEY_PAIRS = [
  {
    name: 'prod_compose',
    anon: generateJwt('anon', SECRET_PROD),
    service: generateJwt('service_role', SECRET_PROD),
  },
  {
    name: 'local_cli',
    anon: generateJwt('anon', SECRET_CLI),
    service: generateJwt('service_role', SECRET_CLI),
  },
];

if (process.env.SUPABASE_ANON_KEY) {
  KEY_PAIRS.unshift({
    name: 'env_keys',
    anon: process.env.SUPABASE_ANON_KEY,
    service: process.env.SUPABASE_SERVICE_ROLE_KEY ?? generateJwt('service_role', SECRET_PROD),
  });
} else if (process.env.VITE_SUPABASE_ANON_KEY) {
  KEY_PAIRS.push({
    name: 'vite_env_keys',
    anon: process.env.VITE_SUPABASE_ANON_KEY,
    service: process.env.SUPABASE_SERVICE_ROLE_KEY ?? generateJwt('service_role', SECRET_CLI),
  });
}

/** Default keys for local Supabase. */
export let LOCAL_SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
export let LOCAL_ANON_KEY = KEY_PAIRS[0].anon;
export let LOCAL_SERVICE_KEY = KEY_PAIRS[0].service;

export const SEED = {
  greenviewOrg: 'a0000000-0000-4000-8000-000000000001',
  borewellRfq: 'f1000000-0000-4000-8000-000000000001',
  quoteA: 'a5000000-0000-4000-8000-000000000001',
  quoteB: 'a5000000-0000-4000-8000-000000000002',
  supplierA: 'd0000000-0000-4000-8000-000000000001',
  supplierB: 'd0000000-0000-4000-8000-000000000002',
} as const;

export const DEMO_PASSWORD = 'password';

export function createAnonClient(customUrl?: string): SupabaseClient {
  return createClient(customUrl ?? LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createServiceClient(customUrl?: string): SupabaseClient {
  return createClient(customUrl ?? LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function isLocalSupabaseReachable(): Promise<boolean> {
  const candidateUrls = [
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
    'http://127.0.0.1:54321',
    'http://localhost:54321',
    'http://127.0.0.1:8000',
    'http://localhost:8000',
  ].filter(Boolean) as string[];

  for (const url of candidateUrls) {
    for (const pair of KEY_PAIRS) {
      try {
        const res = await fetch(`${url}/rest/v1/`, {
          headers: {
            apikey: pair.service,
            Authorization: `Bearer ${pair.service}`,
          },
          signal: AbortSignal.timeout(1500),
        });
        if (res.ok) {
          LOCAL_SUPABASE_URL = url;
          LOCAL_ANON_KEY = pair.anon;
          LOCAL_SERVICE_KEY = pair.service;
          return true;
        }
      } catch {
        // try next candidate endpoint
      }
    }
  }
  return false;
}

export async function signInAs(
  client: SupabaseClient,
  email: string,
  explicitPassword?: string,
): Promise<void> {
  const candidatePasswords: string[] = explicitPassword
    ? [explicitPassword]
    : email === 'bvnbasu@gmail.com'
    ? ['Admin@OTP2026!', DEMO_PASSWORD, '@dm!n123']
    : [
        DEMO_PASSWORD,
        'Admin@OTP2026!',
        '@dm!n123',
        'DemoCommittee2026!',
        'DemoManager2026!',
        'DemoBuyer2026!',
        'DemoAdmin2026!',
      ];

  let lastError: any = null;
  for (const password of candidatePasswords) {
    const { error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (!error) {
      return;
    }
    lastError = error;
  }

  throw new Error(`signIn failed for ${email}: ${lastError?.message || 'Authentication failed'}`);
}

/** Forbidden identity fields in blind evaluation payloads (INV-033–040). */
export const BLIND_FORBIDDEN_KEYS = [
  'supplier_id',
  'supplierId',
  'business_name',
  'businessName',
  'phone',
  'email',
  'address',
  'source',
  'match_score',
  'matchScore',
] as const;

export function assertNoBlindIdentityLeak(row: Record<string, unknown>): void {
  for (const key of BLIND_FORBIDDEN_KEYS) {
    if (key in row && row[key] !== undefined && row[key] !== null) {
      throw new Error(`Blind identity leak: field "${key}" present`);
    }
  }
}
