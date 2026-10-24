/**
 * Contact Us email relay client: hands the composed support notice to the
 * operator bridge (`scripts/whatsapp-bridge`, POST /contact-email), which
 * submits it over SMTP.
 *
 * Kept free of Deno and Node globals so the web test suite and `deno test`
 * exercise the same file the edge function serves.
 *
 * `ok: true` means the relay reported the message accepted by SMTP for the
 * fixed recipient. It never means delivered. Response bodies, the enquiry and
 * the secret are never logged or returned to the caller.
 */

import {
  CONTACT_NOTIFICATION_RECIPIENT,
  type ContactEmailTransport,
  type ContactNotificationEmail,
} from './enquiry.ts';

export const CONTACT_EMAIL_RELAY_PATH = '/contact-email';
export const CONTACT_EMAIL_RELAY_SECRET_HEADER = 'X-Contact-Relay-Secret';
export const CONTACT_EMAIL_RELAY_MIN_SECRET_LENGTH = 32;
/** Above the bridge's own 12 s SMTP deadline, below the edge function's wall clock. */
export const CONTACT_EMAIL_RELAY_TIMEOUT_MS = 15_000;
const MAX_RELAY_RESPONSE_BYTES = 1024;

export interface ContactEmailRelayConfig {
  /** CONTACT_EMAIL_RELAY_URL: the bridge origin, https (http only for loopback). */
  url?: string | null;
  /** CONTACT_EMAIL_RELAY_SECRET */
  secret?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** The validated relay origin, or null when the value is absent or unsafe. */
export function contactEmailRelayOrigin(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const loopback = LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return null;
  if (url.username || url.password) return null;
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) return null;
  return url.origin;
}

function tunnelHeaders(origin: string): Record<string, string> {
  const host = new URL(origin).hostname.toLowerCase();
  return host.endsWith('.ngrok-free.app') || host.endsWith('.ngrok-free.dev') || host.endsWith('.ngrok.io')
    ? { 'ngrok-skip-browser-warning': 'true' }
    : {};
}

async function relayAccepted(response: Response): Promise<boolean> {
  if (response.status !== 200) {
    await response.body?.cancel().catch(() => undefined);
    return false;
  }
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RELAY_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    return false;
  }
  const reader = response.body?.getReader();
  if (!reader) return false;
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_RELAY_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      return false;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const payload: unknown = JSON.parse(text);
  return !!payload && typeof payload === 'object' && (payload as { status?: unknown }).status === 'ACCEPTED';
}

/**
 * null when the relay URL or secret is missing or invalid — the caller then
 * records NOT_CONFIGURED. Otherwise every failure, timeout or non-acceptance
 * resolves to `{ ok: false }`.
 */
export function createContactEmailRelayTransport(config: ContactEmailRelayConfig): ContactEmailTransport | null {
  const origin = contactEmailRelayOrigin(config.url);
  const secret = config.secret?.trim() ?? '';
  if (!origin || secret.length < CONTACT_EMAIL_RELAY_MIN_SECRET_LENGTH) return null;

  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? CONTACT_EMAIL_RELAY_TIMEOUT_MS;
  const endpoint = `${origin}${CONTACT_EMAIL_RELAY_PATH}`;

  return {
    async send(email: ContactNotificationEmail) {
      if (email.to !== CONTACT_NOTIFICATION_RECIPIENT) return { ok: false };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            ...tunnelHeaders(origin),
            'Content-Type': 'application/json; charset=utf-8',
            [CONTACT_EMAIL_RELAY_SECRET_HEADER]: secret,
          },
          body: JSON.stringify({ subject: email.subject, text: email.text, replyTo: email.replyTo }),
          redirect: 'error',
          signal: controller.signal,
        });
        return { ok: await relayAccepted(response) };
      } catch {
        return { ok: false };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
