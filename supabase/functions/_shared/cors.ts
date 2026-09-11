// Locked to the deployed web origin in production. `WEB_ORIGIN` is the
// canonical value; when unset (local dev) we fall back to `*` so `pnpm dev` on
// http://localhost:3000 or http://opentradeprocurement.ai:3000 can still call the functions.
const allowedOrigin = Deno.env.get('WEB_ORIGIN')?.trim() || '*';

export const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-demo-secret',
  'Vary': 'Origin',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}
