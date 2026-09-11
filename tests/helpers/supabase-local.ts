import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Default keys for local Supabase CLI (supabase start). */
export const LOCAL_SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
export const LOCAL_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
export const LOCAL_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export const SEED = {
  greenviewOrg: 'a0000000-0000-4000-8000-000000000001',
  borewellRfq: 'f1000000-0000-4000-8000-000000000001',
  quoteA: 'a5000000-0000-4000-8000-000000000001',
  quoteB: 'a5000000-0000-4000-8000-000000000002',
  supplierA: 'd0000000-0000-4000-8000-000000000001',
  supplierB: 'd0000000-0000-4000-8000-000000000002',
} as const;

export const DEMO_PASSWORD = 'password';

export function createAnonClient(): SupabaseClient {
  return createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createServiceClient(): SupabaseClient {
  return createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function isLocalSupabaseReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: LOCAL_ANON_KEY },
    });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
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
