/**
 * Self-hosted WAHA (WhatsApp HTTP API), the OTP pilot transport.
 *
 * The local scripts call POST /api/sendText and GET /api/sessions/{session}
 * with no API key. This provider does the same, using the base URL and session
 * it was given. It does not invent authentication, and it does not fall back
 * to Meta, Twilio, or the mock.
 *
 * Inbound webhooks are refused. The current gateway calls carry no signature,
 * and an unsigned webhook would let anyone who knows the URL place a bid.
 */

import { isE164, normalizePhone } from '../phone.ts';
import type {
  DeliveryStatusUpdate,
  InboundMessage,
  MessagingProvider,
  OutboundMessage,
  SendReceipt,
  WebhookRequest,
} from '../types.ts';

export interface WahaConfig {
  /** Origin only, such as http://127.0.0.1:3008. */
  baseUrl: string;
  session: string;
  fetchImpl?: typeof fetch;
}

const SESSION_TIMEOUT_MS = 5000;
const SEND_TIMEOUT_MS = 10000;

export class WahaMessagingProvider implements MessagingProvider {
  readonly id = 'WAHA' as const;
  readonly channels = ['WHATSAPP'] as const;

  readonly #baseUrl: string;
  readonly #session: string;
  readonly #fetch: typeof fetch;

  constructor(config: WahaConfig) {
    this.#baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.#session = config.session;
    this.#fetch = config.fetchImpl ?? fetch;
  }

  async send(message: OutboundMessage): Promise<SendReceipt> {
    if (message.channel !== 'WHATSAPP') {
      return this.#failed('WAHA provider handles WhatsApp only');
    }

    const to = normalizePhone(message.to);
    if (!to || !isE164(to)) {
      return this.#failed('invalid recipient');
    }

    const body = message.body?.trim() ?? '';
    if (!body) {
      return this.#failed('WAHA message body is empty');
    }

    const session = await this.#sessionReady();
    if (session) return session;

    try {
      const response = await this.#fetch(`${this.#baseUrl}/api/sendText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          session: this.#session,
          chatId: `${to.slice(1)}@c.us`,
          text: body,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });

      if (!response.ok) {
        return this.#failed(`WAHA returned ${response.status}`);
      }

      const payload = await response.json().catch(() => null);
      const externalMessageId = messageId(payload);
      return { provider: this.id, externalMessageId, status: 'SENT' };
    } catch (error) {
      return this.#failed(sendFailure(error));
    }
  }

  /**
   * There is no signature on the current WAHA calls. Unsigned inbound traffic
   * is discarded.
   */
  async verify(_request: WebhookRequest): Promise<boolean> {
    return false;
  }

  parse(_request: WebhookRequest): InboundMessage[] {
    return [];
  }

  parseStatus(_request: WebhookRequest): DeliveryStatusUpdate[] {
    return [];
  }

  async #sessionReady(): Promise<SendReceipt | null> {
    try {
      const response = await this.#fetch(
        `${this.#baseUrl}/api/sessions/${encodeURIComponent(this.#session)}`,
        { method: 'GET', signal: AbortSignal.timeout(SESSION_TIMEOUT_MS) },
      );

      if (!response.ok) {
        return this.#failed(`WAHA session check returned ${response.status}`);
      }

      const payload = await response.json().catch(() => null);
      if (!payload || typeof payload.status !== 'string') {
        return this.#failed('WAHA session check returned a malformed response');
      }
      if (payload.status !== 'WORKING') {
        return this.#failed('WAHA session is not available');
      }
      return null;
    } catch (error) {
      const timedOut = isTimeout(error);
      return this.#failed(timedOut ? 'WAHA session check timed out' : 'WAHA session check failed');
    }
  }

  #failed(failureReason: string): SendReceipt {
    return {
      provider: this.id,
      externalMessageId: null,
      status: 'FAILED',
      failureReason,
    };
  }
}

function sendFailure(error: unknown): string {
  if (isTimeout(error)) return 'WAHA send timed out';
  return 'WAHA send failed';
}

function isTimeout(error: unknown): boolean {
  const name = error && typeof error === 'object' && 'name' in error
    ? String((error as { name?: string }).name)
    : '';
  return name === 'TimeoutError' || name === 'AbortError';
}

function messageId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as { id?: unknown; key?: { id?: unknown } };
  if (typeof record.id === 'string' && record.id) return record.id;
  if (typeof record.key?.id === 'string' && record.key.id) return record.key.id;
  return null;
}
