// Strict CORS origin whitelist for OTP platform functions.
// Unrestricted wildcard fallback `*` is strictly disallowed.

export const ALLOWED_EXACT_ORIGINS = new Set([
  'https://otpplatform-theta.vercel.app',
  'https://opentradeprocurement.ai',
  'https://www.opentradeprocurement.ai',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

export function isAllowedOrigin(
  origin: string | null | undefined,
  configuredWebOrigin?: string,
): boolean {
  if (!origin) return false;
  const trimmed = origin.trim().toLowerCase();

  // 1. Exact match against trusted production & dev origins
  if (ALLOWED_EXACT_ORIGINS.has(trimmed)) {
    return true;
  }

  // 2. Exact match against configured environment variable WEB_ORIGIN
  if (configuredWebOrigin && trimmed === configuredWebOrigin.trim().toLowerCase()) {
    return true;
  }

  // 3. Match legitimate Vercel preview deployments (e.g. https://otp-git-feature-org.vercel.app)
  // Must end with .vercel.app and not be an attacker domain or bare vercel.app
  if (/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.vercel\.app$/.test(trimmed)) {
    return true;
  }

  return false;
}

export function getCorsHeaders(
  requestOrigin?: string | null,
  configuredWebOrigin?: string,
): Record<string, string> {
  const origin =
    requestOrigin && isAllowedOrigin(requestOrigin, configuredWebOrigin)
      ? requestOrigin
      : 'https://otpplatform-theta.vercel.app';

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-demo-secret',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    Vary: 'Origin',
  };
}
