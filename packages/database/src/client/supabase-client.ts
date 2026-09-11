import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../generated/supabase';

export type TypedSupabaseClient = SupabaseClient<Database>;

export function createSupabaseClient(
  url: string,
  anonOrServiceKey: string,
  options?: { accessToken?: string },
): TypedSupabaseClient {
  const client = createClient<Database>(url, anonOrServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: options?.accessToken
      ? { headers: { Authorization: `Bearer ${options.accessToken}` } }
      : undefined,
  });
  return client;
}
