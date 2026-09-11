/**
 * The provider used by the demo and the tests.
 *
 * This is not a stub standing in for the real thing — it is how the demo runs.
 * A sales conversation happens on a laptop in a meeting room with no Twilio
 * account and often no internet, and "imagine an SMS arrives here" is a much
 * weaker demonstration than showing the message, then answering it as the
 * supplier would.
 *
 * So the mock takes the same path as a real provider: messages are written to
 * supplier_notifications by the caller and read back by the demo UI, and a
 * simulated reply goes through the same webhook and the same gateway as a real
 * one. Nothing about the flow is special-cased for the demo.
 */

import { normalizePhone } from '../phone.ts';
import { timingSafeEqual } from '../crypto.ts';
import type {
  DeliveryStatusUpdate,
  InboundMessage,
  MessagingProvider,
  OutboundMessage,
  SendReceipt,
  WebhookRequest,
} from '../types.ts';

export interface MockMessagingConfig {
  /**
   * Required for a simulated inbound message to be accepted. Without it the
   * webhook would take unsigned traffic, which is fine on a laptop and is not
   * fine anywhere else — so absence of a secret means refuse, not allow.
   */
  sharedSecret?: string;
  /** Forces a send failure, so the failure path can be shown rather than described. */
  failSendsTo?: readonly string[];
  now?: () => Date;
}

export class MockMessagingProvider implements MessagingProvider {
  readonly id = 'MOCK' as const;
  readonly channels = ['SMS', 'WHATSAPP'] as const;

  /** Everything this instance was asked to send. Read by unit tests. */
  readonly outbox: Array<OutboundMessage & { externalMessageId: string }> = [];

  readonly #config: MockMessagingConfig;
  #counter = 0;

  constructor(config: MockMessagingConfig = {}) {
    this.#config = config;
  }

  async send(message: OutboundMessage): Promise<SendReceipt> {
    if (this.#config.failSendsTo?.includes(message.to)) {
      return {
        provider: this.id,
        externalMessageId: null,
        status: 'FAILED',
        failureReason: 'Simulated delivery failure',
      };
    }

    this.#counter += 1;
    const externalMessageId = `mock-${(this.#config.now?.() ?? new Date()).getTime()}-${this.#counter}`;
    this.outbox.push({ ...message, externalMessageId });

    return { provider: this.id, externalMessageId, status: 'SENT' };
  }

  async verify(request: WebhookRequest): Promise<boolean> {
    const secret = this.#config.sharedSecret;
    if (!secret) return false;

    const provided = request.headers['x-mock-signature']
      ?? request.headers['X-Mock-Signature']
      ?? '';

    return timingSafeEqual(secret, provided);
  }

  parse(request: WebhookRequest): InboundMessage[] {
    const payload = safeJson(request.rawBody);
    if (!payload) return [];

    const from = normalizePhone(String(payload.from ?? ''));
    const body = payload.body;

    if (!from || typeof body !== 'string') return [];

    return [{
      provider: this.id,
      channel: payload.channel === 'SMS' ? 'SMS' : 'WHATSAPP',
      // Supplied by the caller when a duplicate delivery is being demonstrated;
      // otherwise generated, so ordinary simulated replies never collide.
      externalMessageId: typeof payload.messageId === 'string' && payload.messageId
        ? payload.messageId
        : `mock-in-${crypto.randomUUID()}`,
      from,
      body,
      raw: payload as Record<string, unknown>,
    }];
  }

  parseStatus(request: WebhookRequest): DeliveryStatusUpdate[] {
    const payload = safeJson(request.rawBody);
    const status = payload?.status;

    if (!status || typeof payload?.messageId !== 'string') return [];

    return [{
      provider: this.id,
      externalMessageId: payload.messageId,
      status,
      failureReason: status === 'FAILED' ? 'Simulated delivery failure' : undefined,
    }];
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
