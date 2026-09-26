import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { describeNotificationStatus } from '@otp/domain';
import {
  WHATSAPP_GATEWAY_SEND_PATH,
  clearDispatchIdempotencyCache,
  dispatchWhatsAppText,
  extractProviderMessageId,
  resolveSupabaseEmailDispatch,
  toWhatsAppChatId,
} from './lib/outbound-dispatch';
import { NotificationDeliveryNotice } from './components/NotificationDeliveryNotice';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** A fetch that never answers until aborted, like a hung provider. */
function hangingFetch(): typeof fetch {
  return vi.fn((_url: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }),
  ) as unknown as typeof fetch;
}

describe('dispatchWhatsAppText (mock provider)', () => {
  beforeEach(() => clearDispatchIdempotencyCache());

  it('provider accepted with message id → ACCEPTED, delivery not confirmed', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(201, { id: { _serialized: 'true_91999@c.us_ABC' } }));
    const out = await dispatchWhatsAppText({ phone: '9999999999', text: 'Hello', fetchImpl });
    expect(out.status).toBe('ACCEPTED');
    expect(out.deliveryConfirmed).toBe(false);
    expect(out.providerMessageId).toBe('true_91999@c.us_ABC');
    expect(fetchImpl).toHaveBeenCalledWith(WHATSAPP_GATEWAY_SEND_PATH, expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.chatId).toBe('919999999999@c.us');
  });

  it('2xx without a message id → SUBMITTED', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    const out = await dispatchWhatsAppText({ phone: '9999999999', text: 'Hello', fetchImpl });
    expect(out.status).toBe('SUBMITTED');
    expect(out.deliveryConfirmed).toBe(false);
  });

  it('never reports DELIVERED from a synchronous send', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'x', status: 'DELIVERED', ack: 3 }));
    const out = await dispatchWhatsAppText({ phone: '9999999999', text: 'Hello', fetchImpl });
    expect(out.status).not.toBe('DELIVERED');
  });

  it('provider rejection → FAILED', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(400, { error: 'bad chat' }));
    const out = await dispatchWhatsAppText({ phone: '9999999999', text: 'Hello', fetchImpl });
    expect(out.status).toBe('FAILED');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries a 5xx and reports the successful retry', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockResolvedValueOnce(jsonResponse(201, { id: 'msg-2' }));
    const out = await dispatchWhatsAppText({ phone: '9999999999', text: 'Hello', fetchImpl, maxAttempts: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(out.status).toBe('ACCEPTED');
    expect(out.providerMessageId).toBe('msg-2');
  });

  it('5xx on the final attempt → FAILED', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(502, {}));
    const out = await dispatchWhatsAppText({ phone: '9999999999', text: 'Hello', fetchImpl, maxAttempts: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(out.status).toBe('FAILED');
    expect(out.retryScheduled).toBe(false);
  });

  it('timeout → FAILED with outcome unknown', async () => {
    const out = await dispatchWhatsAppText({
      phone: '9999999999',
      text: 'Hello',
      fetchImpl: hangingFetch(),
      timeoutMs: 20,
    });
    expect(out.status).toBe('FAILED');
    expect(out.outcomeUnknown).toBe(true);
    const copy = describeNotificationStatus(out, 'REGISTRATION');
    expect(copy.message.toLowerCase()).not.toMatch(/delivered|sent successfully/);
  });

  it('network error → FAILED', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const out = await dispatchWhatsAppText({ phone: '9999999999', text: 'Hello', fetchImpl });
    expect(out.status).toBe('FAILED');
  });

  it('duplicate idempotency key is not sent twice and keeps the prior status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'msg-1' }));
    const first = await dispatchWhatsAppText({ phone: '9999999999', text: 'Hi', idempotencyKey: 'registration:R1', fetchImpl });
    const second = await dispatchWhatsAppText({ phone: '9999999999', text: 'Hi', idempotencyKey: 'registration:R1', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(first.status).toBe('ACCEPTED');
    expect(second.status).toBe('ACCEPTED');
    expect(second.duplicate).toBe(true);
  });

  it('a failed attempt may be retried with the same key', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(400, {}))
      .mockResolvedValueOnce(jsonResponse(201, { id: 'msg-3' }));
    await dispatchWhatsAppText({ phone: '9999999999', text: 'Hi', idempotencyKey: 'k', fetchImpl });
    const retry = await dispatchWhatsAppText({ phone: '9999999999', text: 'Hi', idempotencyKey: 'k', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(retry.status).toBe('ACCEPTED');
  });

  it('invalid phone → NOT_ATTEMPTED without calling the provider', async () => {
    const fetchImpl = vi.fn();
    const out = await dispatchWhatsAppText({ phone: '123', text: 'Hi', fetchImpl });
    expect(out.status).toBe('NOT_ATTEMPTED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('extracts provider ids from the known response shapes', () => {
    expect(extractProviderMessageId({ id: 'a' })).toBe('a');
    expect(extractProviderMessageId({ id: { id: 'b' } })).toBe('b');
    expect(extractProviderMessageId({ key: { id: 'c' } })).toBe('c');
    expect(extractProviderMessageId({ messageId: 'd' })).toBe('d');
    expect(extractProviderMessageId({})).toBeNull();
  });

  it('normalises Indian 10-digit numbers', () => {
    expect(toWhatsAppChatId('+91 98765 43210')).toBe('919876543210@c.us');
    expect(toWhatsAppChatId('98765 43210')).toBe('919876543210@c.us');
  });

  it('Supabase email: no error → SUBMITTED, error → FAILED', () => {
    expect(resolveSupabaseEmailDispatch(null).status).toBe('SUBMITTED');
    expect(resolveSupabaseEmailDispatch({ message: 'rate limit', status: 429 }).status).not.toBe('SUBMITTED');
    expect(resolveSupabaseEmailDispatch({ message: 'invalid email', status: 400 }).status).toBe('FAILED');
  });
});

describe('NotificationDeliveryNotice', () => {
  it('renders the status label and truthful copy', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'm' }));
    clearDispatchIdempotencyCache();
    const resolution = await dispatchWhatsAppText({ phone: '9999999999', text: 'Hi', fetchImpl });
    const html = renderToStaticMarkup(
      React.createElement(NotificationDeliveryNotice, { resolution, purpose: 'REGISTRATION' }),
    );
    expect(html).toContain('data-status="ACCEPTED"');
    expect(html).toContain('Accepted by provider');
    expect(html).toContain('Delivery is not confirmed');
    expect(html).not.toMatch(/sent successfully|Delivered:/i);
  });
});
