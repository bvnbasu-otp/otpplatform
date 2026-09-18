/**
 * Meta's WhatsApp Cloud API.
 *
 * Included so the provider seam is proven by two real implementations rather
 * than one plus a mock — a boundary that has only ever had one implementation
 * usually turns out to be shaped like that implementation.
 *
 * Sending is limited to plain text here. Meta requires pre-approved templates
 * to open a conversation with a supplier who has not messaged recently, and
 * registering those templates is an account-level task rather than a code one;
 * sendTemplate is where that goes when the templates exist.
 */

import { hmacSha256Hex, timingSafeEqual } from '../crypto.ts';
import { normalizePhone } from '../phone.ts';
import type {
  DeliveryStatusUpdate,
  InboundMessage,
  MessagingProvider,
  OutboundMessage,
  SendReceipt,
  WebhookRequest,
} from '../types.ts';

export interface MetaWhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  /** Verifies X-Hub-Signature-256. Without it every webhook is rejected. */
  appSecret: string;
  graphVersion?: string;
  fetchImpl?: typeof fetch;
}

const META_STATUS: Record<string, DeliveryStatusUpdate['status']> = {
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
};

export class MetaWhatsAppProvider implements MessagingProvider {
  readonly id = 'META' as const;
  readonly channels = ['WHATSAPP'] as const;

  readonly #config: MetaWhatsAppConfig;
  readonly #fetch: typeof fetch;

  constructor(config: MetaWhatsAppConfig) {
    this.#config = config;
    this.#fetch = config.fetchImpl ?? fetch;
  }

  async send(message: OutboundMessage): Promise<SendReceipt> {
    if (message.channel !== 'WHATSAPP') {
      return {
        provider: this.id,
        externalMessageId: null,
        status: 'FAILED',
        failureReason: 'Meta provider handles WhatsApp only',
      };
    }

    const version = this.#config.graphVersion ?? 'v20.0';

    try {
      const signal = AbortSignal.timeout(5000);
      const response = await this.#fetch(
        `https://graph.facebook.com/${version}/${this.#config.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.#config.accessToken}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            // Meta wants the number without the leading plus.
            to: message.to.replace(/^\+/, ''),
            type: 'text',
            text: { preview_url: true, body: message.body },
          }),
          signal,
        },
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          provider: this.id,
          externalMessageId: null,
          status: 'FAILED',
          failureReason: String(
            payload?.error?.message ?? `Meta returned ${response.status}`,
          ),
        };
      }

      return {
        provider: this.id,
        externalMessageId: payload?.messages?.[0]?.id ?? null,
        status: 'SENT',
      };
    } catch (error: any) {
      const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      return {
        provider: this.id,
        externalMessageId: null,
        status: 'FAILED',
        failureReason: isTimeout ? 'Meta WhatsApp request timed out after 5000ms' : (error instanceof Error ? error.message : 'Meta request failed'),
      };
    }
  }

  async verify(request: WebhookRequest): Promise<boolean> {
    const header = request.headers['x-hub-signature-256']
      ?? request.headers['X-Hub-Signature-256'];

    if (!header || !this.#config.appSecret) return false;

    const provided = header.replace(/^sha256=/, '');
    const expected = await hmacSha256Hex(this.#config.appSecret, request.rawBody);
    return timingSafeEqual(expected, provided);
  }

  parse(request: WebhookRequest): InboundMessage[] {
    const payload = safeJson(request.rawBody);
    const out: InboundMessage[] = [];

    for (const entry of asArray(payload?.entry)) {
      for (const change of asArray(entry?.changes)) {
        for (const message of asArray(change?.value?.messages)) {
          // Images, locations and voice notes are acknowledged as unreadable
          // rather than parsed. A photo of a handwritten price is not something
          // to guess at.
          if (message?.type !== 'text') continue;

          const from = normalizePhone(String(message?.from ?? ''));
          const body = message?.text?.body;

          if (!from || typeof body !== 'string') continue;

          out.push({
            provider: this.id,
            channel: 'WHATSAPP',
            externalMessageId: message?.id ?? null,
            from,
            body,
            raw: message as Record<string, unknown>,
          });
        }
      }
    }

    return out;
  }

  parseStatus(request: WebhookRequest): DeliveryStatusUpdate[] {
    const payload = safeJson(request.rawBody);
    const out: DeliveryStatusUpdate[] = [];

    for (const entry of asArray(payload?.entry)) {
      for (const change of asArray(entry?.changes)) {
        for (const status of asArray(change?.value?.statuses)) {
          const mapped = META_STATUS[String(status?.status)];
          if (!mapped || !status?.id) continue;

          out.push({
            provider: this.id,
            externalMessageId: String(status.id),
            status: mapped,
            failureReason: mapped === 'FAILED'
              ? String(status?.errors?.[0]?.title ?? 'WhatsApp delivery failed')
              : undefined,
          });
        }
      }
    }

    return out;
  }
}

// deno-lint-ignore no-explicit-any
function safeJson(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// deno-lint-ignore no-explicit-any
function asArray(value: any): any[] {
  return Array.isArray(value) ? value : [];
}
