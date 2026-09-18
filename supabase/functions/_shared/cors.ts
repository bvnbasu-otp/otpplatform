// Strict CORS origin whitelist for OTP platform functions.
// Unrestricted wildcard fallback `*` is strictly disallowed.
const ALLOWED_EXACT_ORIGINS = new Set([
  'https://otpplatform-theta.vercel.app',
  'https://opentradeprocurement.ai',
  'https://www.opentradeprocurement.ai',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  const trimmed = origin.trim().toLowerCase();

  // 1. Exact match against trusted production & dev origins
  if (ALLOWED_EXACT_ORIGINS.has(trimmed)) {
    return true;
  }

  // 2. Exact match against configured environment variable WEB_ORIGIN
  try {
    const configured = typeof Deno !== 'undefined' ? Deno.env.get('WEB_ORIGIN')?.trim().toLowerCase() : undefined;
    if (configured && trimmed === configured) {
      return true;
    }
  } catch {}

  // 3. Match legitimate Vercel preview deployments (e.g. https://otp-git-feature-org.vercel.app)
  // Must end with .vercel.app and not be an attacker domain or bare vercel.app
  if (/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.vercel\.app$/.test(trimmed)) {
    return true;
  }

  return false;
}

export function getCorsHeaders(requestOrigin?: string | null): Record<string, string> {
  const origin = requestOrigin && isAllowedOrigin(requestOrigin)
    ? requestOrigin
    : 'https://otpplatform-theta.vercel.app';

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-demo-secret',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Vary': 'Origin',
  };
}

export const corsHeaders = getCorsHeaders();

export function jsonResponse(body: unknown, status = 200, requestOrigin?: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(requestOrigin), 'Content-Type': 'application/json' },
  });
}

export function errorResponse(message: string, status = 400, requestOrigin?: string | null): Response {
  return jsonResponse({ error: message }, status, requestOrigin);
}
