/**
 * CORS shared module — Deno runtime coverage.
 *
 * corsHeaders is read at import time, so the WEB_ORIGIN behaviour is exercised
 * by starting a subprocess with the env var set. That is done in
 * scripts/test-functions.ts; this file only asserts the default shape.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { corsHeaders, errorResponse, getCorsHeaders, isAllowedOrigin, jsonResponse } from './cors.ts';

Deno.test('corsHeaders always allow the credentials-carrying headers we send', () => {
  const allowed = corsHeaders['Access-Control-Allow-Headers'];
  for (const header of ['authorization', 'content-type', 'x-demo-secret', 'x-otp-contact-client-token']) {
    assertEquals(allowed.includes(header), true, header);
  }
});

Deno.test('corsHeaders carry a Vary header so the CDN caches per origin', () => {
  assertEquals(corsHeaders['Vary'], 'Origin');
});

Deno.test('jsonResponse returns JSON with the CORS headers', async () => {
  const response = jsonResponse({ ok: true });
  assertEquals(response.status, 200);
  assertEquals(response.headers.get('content-type'), 'application/json');
  assertEquals(
    response.headers.get('access-control-allow-headers')?.includes('x-demo-secret'),
    true,
  );
  const body = await response.json();
  assertEquals(body.ok, true);
});

Deno.test('errorResponse defaults to 400 and carries the message', async () => {
  const response = errorResponse('nope');
  assertEquals(response.status, 400);
  const body = await response.json();
  assertEquals(body.error, 'nope');
});

Deno.test('errorResponse honours a caller-supplied status', () => {
  assertEquals(errorResponse('forbidden', 403).status, 403);
});

Deno.test('origin allowlist accepts production and local development origins', () => {
  for (const origin of [
    'https://otpplatform-theta.vercel.app',
    'https://opentradeprocurement.ai',
    'https://www.opentradeprocurement.ai',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
  ]) {
    assertEquals(isAllowedOrigin(origin), true, origin);
  }
});

Deno.test('origin allowlist rejects arbitrary Vercel and hostile origins', () => {
  for (const origin of [
    'https://random-project.vercel.app',
    'https://otpplatform-git-feature-org.vercel.app',
    'https://otpplatform-theta.vercel.app.attacker.example',
    'http://otpplatform-theta.vercel.app',
    'https://opentradeprocurement.ai.attacker.example',
  ]) {
    assertEquals(isAllowedOrigin(origin), false, origin);
  }
});

Deno.test('untrusted origin receives the production fallback, not a reflected origin', () => {
  assertEquals(
    getCorsHeaders('https://evil.example')['Access-Control-Allow-Origin'],
    'https://otpplatform-theta.vercel.app',
  );
});
