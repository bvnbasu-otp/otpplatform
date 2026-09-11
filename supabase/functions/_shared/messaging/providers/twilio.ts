/**
 * Twilio, for both SMS and WhatsApp.
 *
 * The only subtle part is verification. Twilio signs the full request URL
 * concatenated with the POST parameters sorted by name, which means the URL we
 * reconstruct must match the one Twilio called byte for byte — behind a proxy
 * that rewrites the scheme or host, the configured public URL is the one to
 * sign, not the one the runtime reports.
 */

import { hmacSha1Base64, timingSafeEqual } from '../crypto.ts';
import { normalizePhone } from '../phone.ts';
import type {
  DeliveryStatusUpdate,
  InboundMessage,
  MessagingChannel,
  MessagingProvider,
  OutboundMessage,
  SendReceipt,
  WebhookRequest,
} from '../types.ts';

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** Sender for SMS, in E.164. */
  smsFrom?: string;
  /** Sender for WhatsApp, in E.164 (the whatsapp: prefix is added here). */
  whatsappFrom?: string;
  /**
   * The public URL Twilio was configured to call. Signatures are computed over
   * this rather than over the request as observed, because a proxy in front of
   * the function changes the observed URL and would break every signature.
   */
  webhookUrl?: string;
  fetchImpl?: typeof fetch;
}

const TWILIO_STATUS: Record<string, DeliveryStatusUpdate['status']> = {
  queued: 'QUEUED',
  accepted: 'QUEUED',
  sending: 'SENT',
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  undelivered: 'FAILED',
  failed: 'FAILED',
};

export class TwilioMessagingProvider implements MessagingProvider {
  readonly id = 'TWILIO' as const;
  readonly channels = ['SMS', 'WHATSAPP'] as const;

  readonly #config: TwilioConfig;
  readonly #fetch: typeof fetch;

  constructor(config: TwilioConfig) {
    this.#config = config;
    this.#fetch = config.fetchImpl ?? fetch;
  }

  async send(message: OutboundMessage): Promise<SendReceipt> {
    const from = message.channel === 'WHATSAPP'
      ? this.#config.whatsappFrom
      : this.#config.smsFrom;

    if (!from) {
      return {
        provider: this.id,
        externalMessageId: null,
        status: 'FAILED',
        failureReason: `No Twilio sender configured for ${message.channel}`,
      };
    }

    const body = new URLSearchParams({
      From: address(from, message.channel),
      To: address(message.to, message.channel),
      Body: message.body,
    });

    try {
      const response = await this.#fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${this.#config.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${btoa(`${this.#config.accountSid}:${this.#config.authToken}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
        },
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          provider: this.id,
          externalMessageId: null,
          status: 'FAILED',
          // Twilio's own message, not ours: it names the actual problem
          // (unreachable number, unverified sender) far better than a guess.
          failureReason: String(payload?.message ?? `Twilio returned ${response.status}`),
        };
      }

      return {
        provider: this.id,
        externalMessageId: payload?.sid ?? null,
        status: TWILIO_STATUS[String(payload?.status)] === 'SENT' ? 'SENT' : 'QUEUED',
      };
    } catch (error) {
      // A send failure must never abort the surrounding operation: nine
      // suppliers reachable out of ten is nine bids, not zero.
      return {
        provider: this.id,
        externalMessageId: null,
        status: 'FAILED',
        failureReason: error instanceof Error ? error.message : 'Twilio request failed',
      };
    }
  }

  async verify(request: WebhookRequest): Promise<boolean> {
    const provided = request.headers['x-twilio-signature']
      ?? request.headers['X-Twilio-Signature'];

    if (!provided || !this.#config.authToken) return false;

    const url = this.#config.webhookUrl ?? request.url;
    const params = new URLSearchParams(request.rawBody);
    const sorted = [...params.keys()].sort();

    let payload = url;
    for (const key of sorted) {
      payload += key + (params.get(key) ?? '');
    }

    const expected = await hmacSha1Base64(this.#config.authToken, payload);
    return timingSafeEqual(expected, provided);
  }

  parse(request: WebhookRequest): InboundMessage[] {
    const params = new URLSearchParams(request.rawBody);

    // A status callback is not a message. Both arrive here.
    if (params.get('MessageStatus') && !params.get('Body')) return [];

    const from = normalizePhone(params.get('From'));
    const body = params.get('Body');

    if (!from || body === null) return [];

    return [{
      provider: this.id,
      channel: params.get('From')?.startsWith('whatsapp:') ? 'WHATSAPP' : 'SMS',
      externalMessageId: params.get('MessageSid') ?? params.get('SmsMessageSid') ?? null,
      from,
      body,
      raw: Object.fromEntries(params.entries()),
    }];
  }

  parseStatus(request: WebhookRequest): DeliveryStatusUpdate[] {
    const params = new URLSearchParams(request.rawBody);
    const status = params.get('MessageStatus');
    const sid = params.get('MessageSid') ?? params.get('SmsSid');

    if (!status || !sid) return [];

    const mapped = TWILIO_STATUS[status.toLowerCase()];
    if (!mapped) return [];

    return [{
      provider: this.id,
      externalMessageId: sid,
      status: mapped,
      failureReason: mapped === 'FAILED'
        ? params.get('ErrorMessage') ?? `Twilio status ${status}`
        : undefined,
    }];
  }
}

function address(phone: string, channel: MessagingChannel): string {
  return channel === 'WHATSAPP' ? `whatsapp:${phone}` : phone;
}
