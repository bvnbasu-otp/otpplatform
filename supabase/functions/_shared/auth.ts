import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export function createUserClient(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }

  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    },
  );
}

export function rfqIdFromUrl(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  const rfqIdx = parts.indexOf('rfqs');
  if (rfqIdx === -1 || !parts[rfqIdx + 1]) return null;
  return parts[rfqIdx + 1];
}
