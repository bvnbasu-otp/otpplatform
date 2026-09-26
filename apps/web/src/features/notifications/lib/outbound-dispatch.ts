import {
  resolveNotificationStatus,
  type NotificationStatusResolution,
  type ProviderObservation,
} from '@otp/domain';

/**
 * Client-side outbound dispatch that reports what the provider actually said.
 *
 * The WhatsApp gateway (WAHA, proxied at /waha) answers synchronously with a
 * message id when it accepts a send; it does not tell us the recipient got it.
 * Supabase Auth email endpoints answer "no error" once the request is queued
 * with their mailer. Neither is a delivery receipt, so neither can be DELIVERED.
 */

export const WHATSAPP_GATEWAY_SEND_PATH = '/waha/api/sendText';
export const DEFAULT_DISPATCH_TIMEOUT_MS = 8000;

/** Strictly sanitizes input string to 7-bit ASCII plain text. */
export function sanitizeToAscii(text: string): string {
  return text
    .replace(/\u2014|\u2013/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2022/g, '*')
    .replace(/\u20B9/g, 'Rs. ')
    .replace(/[^\x20-\x7E\r\n\t]/g, '')
    .trim();
}

export function toWhatsAppChatId(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return `${digits.length === 10 ? `91${digits}` : digits}@c.us`;
}

export function extractProviderMessageId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, any>;
  const id = b.id;
  if (typeof id === 'string' && id.trim()) return id.trim();
  if (id && typeof id === 'object') {
    if (typeof id._serialized === 'string' && id._serialized) return id._serialized;
    if (typeof id.id === 'string' && id.id) return id.id;
  }
  if (typeof b.key?.id === 'string' && b.key.id) return b.key.id;
  if (typeof b.messageId === 'string' && b.messageId) return b.messageId;
  return null;
}

const recentDispatches = new Map<string, NotificationStatusResolution>();

/** Test hook: forget dispatch idempotency keys. */
export function clearDispatchIdempotencyCache(): void {
  recentDispatches.clear();
}

export interface WhatsAppDispatchOptions {
  phone: string;
  text: string;
  /** Same key → second call is suppressed and reported as a duplicate. */
  idempotencyKey?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  fetchImpl?: typeof fetch;
}

async function attemptWhatsAppSend(
  chatId: string,
  text: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<ProviderObservation> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller?.abort();
  }, timeoutMs);
  try {
    const res = await fetchImpl(WHATSAPP_GATEWAY_SEND_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ session: 'default', chatId, text: sanitizeToAscii(text) }),
      signal: controller?.signal,
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return {
      kind: 'HTTP_RESPONSE',
      httpStatus: res.status,
      providerMessageId: res.ok ? extractProviderMessageId(body) : null,
    };
  } catch (err) {
    if (timedOut) return { kind: 'TIMEOUT', timeoutMs };
    return { kind: 'NETWORK_ERROR', errorMessage: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export async function dispatchWhatsAppText(options: WhatsAppDispatchOptions): Promise<NotificationStatusResolution> {
  const chatId = toWhatsAppChatId(options.phone);
  if (!chatId) {
    return resolveNotificationStatus({
      channel: 'WHATSAPP',
      observation: { kind: 'NOT_ATTEMPTED', reason: 'No valid phone number' },
    });
  }

  const key = options.idempotencyKey;
  const prior = key ? recentDispatches.get(key) : undefined;
  if (prior && prior.status !== 'FAILED' && prior.status !== 'NOT_ATTEMPTED') {
    return resolveNotificationStatus({
      channel: 'WHATSAPP',
      observation: { kind: 'DUPLICATE', providerMessageId: prior.providerMessageId },
      previousStatus: prior.status,
    });
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_DISPATCH_TIMEOUT_MS;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 1);

  let resolution: NotificationStatusResolution | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const observation = await attemptWhatsAppSend(chatId, options.text, timeoutMs, fetchImpl);
    resolution = resolveNotificationStatus({
      channel: 'WHATSAPP',
      observation,
      previousStatus: resolution?.status ?? null,
      attempt,
      maxAttempts,
    });
    if (!resolution.retryScheduled) break;
  }

  const final = resolution!;
  if (key) recentDispatches.set(key, final);
  return final;
}

/**
 * Maps a Supabase Auth mail call (signInWithOtp / resetPasswordForEmail) onto the status scale.
 * "No error" means GoTrue took the request; it is SUBMITTED, not delivered.
 */
export function resolveSupabaseEmailDispatch(error: { message?: string; status?: number } | string | null | undefined): NotificationStatusResolution {
  if (!error) {
    return resolveNotificationStatus({ channel: 'EMAIL', observation: { kind: 'HTTP_RESPONSE', httpStatus: 200 } });
  }
  const message = typeof error === 'string' ? error : error.message ?? 'Email request failed';
  const status = typeof error === 'string' ? 400 : error.status ?? 400;
  return resolveNotificationStatus({
    channel: 'EMAIL',
    observation: { kind: 'HTTP_RESPONSE', httpStatus: status, errorMessage: message },
  });
}
