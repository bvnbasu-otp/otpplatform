/**
 * HTTP flow of the public `contact-enquiry` function.
 *
 * A POST is charged against the caller's allowance before its body is read:
 * the server secret is checked, the signed client identity is resolved, the
 * limiter is consulted, and only an allowed request has its bounded body read,
 * parsed and handed to `handleContactEnquiry`. Malformed, invalid and
 * oversized submissions therefore consume quota like valid ones. A limiter
 * that errors, throws or answers with anything but `allowed: true|false`
 * fails closed. Every response after identity resolution carries the
 * server-issued client token, including the 503 for an unexpected failure.
 *
 * Client-token policy (see client-identity.ts): the token has no expiry and is
 * returned unchanged while its signature verifies. Only a missing, malformed
 * or unverifiable token (or a changed secret) yields a newly issued identity.
 *
 * Every dependency is injected, and nothing here imports a Supabase client or
 * starts a server, so the web test suite and `deno test` drive it with fakes.
 * Request contents are never logged.
 */

import { errorResponse, getCorsHeaders, jsonResponse } from '../cors.ts';
import type { ContactClientIdentity } from './client-identity.ts';
import { CONTACT_MAX_REQUEST_BYTES, type ContactEnquiryDeps, handleContactEnquiry } from './enquiry.ts';

export const CONTACT_RATE_LIMIT_MIN_SECRET_LENGTH = 32;

/** The limiter RPC outcome as returned; only `data.allowed === true` admits a request. */
export interface ContactRateLimitResult {
  data: unknown;
  error: unknown;
}

export interface ContactHttpDeps {
  /** CONTACT_RATE_LIMIT_SECRET; a missing or short secret refuses every POST. */
  rateLimitSecret(): string | null | undefined;
  resolveIdentity(req: Request, secret: string): Promise<ContactClientIdentity>;
  /** Atomically consumes one request from the client and endpoint allowances. */
  checkRateLimit(bucketKey: string): Promise<ContactRateLimitResult>;
  enquiry: ContactEnquiryDeps;
}

type RateLimitDecision = 'ALLOWED' | 'LIMITED' | 'UNAVAILABLE';

function rateLimitDecision(result: ContactRateLimitResult | null): RateLimitDecision {
  if (!result || result.error) return 'UNAVAILABLE';
  const data = result.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'UNAVAILABLE';
  const allowed = (data as { allowed?: unknown }).allowed;
  if (allowed === true) return 'ALLOWED';
  if (allowed === false) return 'LIMITED';
  return 'UNAVAILABLE';
}

/** The UTF-8 body, or null when it exceeds CONTACT_MAX_REQUEST_BYTES. Throws on invalid UTF-8. */
async function readBoundedBody(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > CONTACT_MAX_REQUEST_BYTES) return null;

  const reader = req.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > CONTACT_MAX_REQUEST_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export async function handleContactHttpRequest(req: Request, deps: ContactHttpDeps): Promise<Response> {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(origin) });
  }
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405, origin);
  }

  const secret = deps.rateLimitSecret()?.trim() ?? '';
  if (secret.length < CONTACT_RATE_LIMIT_MIN_SECRET_LENGTH) {
    console.error('contact-enquiry: rate limiter is not configured');
    return jsonResponse({ ok: false, code: 'NOT_RECORDED' }, 503, origin);
  }

  let identity: ContactClientIdentity;
  try {
    identity = await deps.resolveIdentity(req, secret);
  } catch {
    console.error('contact-enquiry: client identity could not be resolved');
    return jsonResponse({ ok: false, code: 'NOT_RECORDED' }, 503, origin);
  }
  const reply = (body: object, status: number) =>
    jsonResponse({ ...body, clientToken: identity.token }, status, origin);

  try {
    return await handleIdentifiedRequest(req, deps, identity, reply);
  } catch {
    console.error('contact-enquiry: request failed');
    return reply({ ok: false, code: 'NOT_RECORDED' }, 503);
  }
}

async function handleIdentifiedRequest(
  req: Request,
  deps: ContactHttpDeps,
  identity: ContactClientIdentity,
  reply: (body: object, status: number) => Response,
): Promise<Response> {
  let limit: RateLimitDecision;
  try {
    limit = rateLimitDecision(await deps.checkRateLimit(identity.bucketKey));
  } catch {
    limit = 'UNAVAILABLE';
  }
  if (limit === 'LIMITED') return reply({ ok: false, code: 'RATE_LIMITED' }, 429);
  if (limit !== 'ALLOWED') return reply({ ok: false, code: 'NOT_RECORDED' }, 503);

  let raw: string | null;
  try {
    raw = await readBoundedBody(req);
  } catch {
    raw = null;
  }
  if (raw === null) return reply({ ok: false, code: 'INVALID' }, 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply({ ok: false, code: 'INVALID' }, 400);
  }

  const result = await handleContactEnquiry(body, deps.enquiry);
  return reply(result.body, result.httpStatus);
}
