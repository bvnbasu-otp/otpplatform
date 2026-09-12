import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

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
  const primaryPassword =
    explicitPassword ||
    (email === 'bvnbasu@gmail.com'
      ? 'Admin@OTP2026!'
      : DEMO_PASSWORD);

  let { error } = await client.auth.signInWithPassword({
    email,
    password: primaryPassword,
  });

  // Fallback for admin if @dm!n123 was used
  if (error && email === 'admin@otp.test') {
    const retry = await client.auth.signInWithPassword({
      email,
      password: '@dm!n123',
    });
    if (!retry.error) {
      error = null;
    }
  }

  if (error) {
    throw new Error(`signIn failed for ${email}: ${error.message}`);
  }
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
