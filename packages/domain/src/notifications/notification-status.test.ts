import { describe, expect, it } from 'vitest';
import {
  describeNotificationStatus,
  mapStoredNotificationStatus,
  resolveHttpDispatch,
  resolveNotificationStatus,
  type NotificationDeliveryStatus,
} from './notification-status';

describe('notification status truth table', () => {
  it('HTTP 2xx with provider message id is ACCEPTED, never DELIVERED', () => {
    const r = resolveHttpDispatch('WHATSAPP', 201, 'wamid.123');
    expect(r.status).toBe('ACCEPTED');
    expect(r.deliveryConfirmed).toBe(false);
    expect(r.providerMessageId).toBe('wamid.123');
  });

  it('HTTP 2xx without a provider receipt id is only SUBMITTED', () => {
    const r = resolveHttpDispatch('EMAIL', 200, null);
    expect(r.status).toBe('SUBMITTED');
    expect(r.deliveryConfirmed).toBe(false);
  });

  it('only a provider delivery callback yields DELIVERED', () => {
    for (const s of ['delivered', 'READ', 'played']) {
      const r = resolveNotificationStatus({
        channel: 'WHATSAPP',
        observation: { kind: 'PROVIDER_CALLBACK', providerStatus: s, providerMessageId: 'm1' },
        previousStatus: 'ACCEPTED',
      });
      expect(r.status).toBe('DELIVERED');
      expect(r.deliveryConfirmed).toBe(true);
    }
  });

  it('provider "sent" callback stays ACCEPTED (not delivered)', () => {
    const r = resolveNotificationStatus({
      channel: 'WHATSAPP',
      observation: { kind: 'PROVIDER_CALLBACK', providerStatus: 'sent' },
      previousStatus: 'SUBMITTED',
    });
    expect(r.status).toBe('ACCEPTED');
  });

  it('bounce / failed callbacks are FAILED', () => {
    const r = resolveNotificationStatus({
      channel: 'EMAIL',
      observation: { kind: 'PROVIDER_CALLBACK', providerStatus: 'bounced' },
      previousStatus: 'ACCEPTED',
    });
    expect(r.status).toBe('FAILED');
  });

  it('a late failure callback never erases a confirmed delivery', () => {
    const r = resolveNotificationStatus({
      channel: 'EMAIL',
      observation: { kind: 'PROVIDER_CALLBACK', providerStatus: 'failed' },
      previousStatus: 'DELIVERED',
    });
    expect(r.status).toBe('DELIVERED');
  });

  it('non-retryable 4xx is FAILED with no retry', () => {
    const r = resolveNotificationStatus({
      channel: 'WHATSAPP',
      observation: { kind: 'HTTP_RESPONSE', httpStatus: 400 },
      attempt: 1,
      maxAttempts: 3,
    });
    expect(r.status).toBe('FAILED');
    expect(r.retryScheduled).toBe(false);
  });

  it('5xx / 429 with attempts remaining is QUEUED for retry; final attempt is FAILED', () => {
    const retry = resolveNotificationStatus({
      channel: 'WHATSAPP',
      observation: { kind: 'HTTP_RESPONSE', httpStatus: 503 },
      attempt: 1,
      maxAttempts: 3,
    });
    expect(retry.status).toBe('QUEUED');
    expect(retry.retryScheduled).toBe(true);

    const last = resolveNotificationStatus({
      channel: 'WHATSAPP',
      observation: { kind: 'HTTP_RESPONSE', httpStatus: 429 },
      attempt: 3,
      maxAttempts: 3,
    });
    expect(last.status).toBe('FAILED');
    expect(last.retryScheduled).toBe(false);
  });

  it('timeout is FAILED with unknown outcome (never success)', () => {
    const r = resolveNotificationStatus({
      channel: 'WHATSAPP',
      observation: { kind: 'TIMEOUT', timeoutMs: 8000 },
    });
    expect(r.status).toBe('FAILED');
    expect(r.outcomeUnknown).toBe(true);
    expect(r.deliveryConfirmed).toBe(false);
  });

  it('network error is FAILED (or QUEUED when a retry remains)', () => {
    expect(
      resolveNotificationStatus({ channel: 'EMAIL', observation: { kind: 'NETWORK_ERROR' } }).status,
    ).toBe('FAILED');
    expect(
      resolveNotificationStatus({
        channel: 'EMAIL',
        observation: { kind: 'NETWORK_ERROR' },
        attempt: 1,
        maxAttempts: 2,
      }).status,
    ).toBe('QUEUED');
  });

  it('a retry that times out does not downgrade an earlier ACCEPTED', () => {
    const r = resolveNotificationStatus({
      channel: 'WHATSAPP',
      observation: { kind: 'TIMEOUT' },
      previousStatus: 'ACCEPTED',
      attempt: 2,
      maxAttempts: 3,
    });
    expect(r.status).toBe('ACCEPTED');
    expect(r.retryScheduled).toBe(false);
  });

  it('duplicate dispatch keeps the recorded status and flags the duplicate', () => {
    const r = resolveNotificationStatus({
      channel: 'WHATSAPP',
      observation: { kind: 'DUPLICATE' },
      previousStatus: 'ACCEPTED',
    });
    expect(r.status).toBe('ACCEPTED');
    expect(r.duplicate).toBe(true);
    const fresh = resolveNotificationStatus({ channel: 'WHATSAPP', observation: { kind: 'DUPLICATE' } });
    expect(fresh.status).toBe('SUBMITTED');
    expect(fresh.deliveryConfirmed).toBe(false);
  });

  it('enqueue and not-attempted map to QUEUED / NOT_ATTEMPTED', () => {
    expect(resolveNotificationStatus({ channel: 'EMAIL', observation: { kind: 'ENQUEUED' } }).status).toBe('QUEUED');
    expect(
      resolveNotificationStatus({ channel: 'EMAIL', observation: { kind: 'NOT_ATTEMPTED' } }).status,
    ).toBe('NOT_ATTEMPTED');
  });
});

describe('stored status mapping', () => {
  it('maps legacy SENT to ACCEPTED, never DELIVERED', () => {
    expect(mapStoredNotificationStatus('SENT')).toBe('ACCEPTED');
    expect(mapStoredNotificationStatus('PROVIDER_ACCEPTED')).toBe('ACCEPTED');
    expect(mapStoredNotificationStatus('DISPATCH_REQUESTED')).toBe('SUBMITTED');
    expect(mapStoredNotificationStatus('PENDING')).toBe('QUEUED');
    expect(mapStoredNotificationStatus('DELIVERED')).toBe('DELIVERED');
    expect(mapStoredNotificationStatus('FAILED')).toBe('FAILED');
    expect(mapStoredNotificationStatus('UNAVAILABLE')).toBe('NOT_ATTEMPTED');
    expect(mapStoredNotificationStatus('something-new')).toBe('NOT_ATTEMPTED');
    expect(mapStoredNotificationStatus(null)).toBe('NOT_ATTEMPTED');
  });
});

describe('customer-facing copy', () => {
  const nonDelivered: NotificationDeliveryStatus[] = ['NOT_ATTEMPTED', 'QUEUED', 'SUBMITTED', 'ACCEPTED', 'FAILED'];

  it('never claims delivery or "sent successfully" unless DELIVERED', () => {
    for (const status of nonDelivered) {
      for (const channel of ['EMAIL', 'WHATSAPP'] as const) {
        const copy = describeNotificationStatus({ status, channel }, 'REGISTRATION');
        expect(copy.message).not.toMatch(/was delivered|sent successfully|message sent/i);
        expect(copy.label).not.toMatch(/delivered/i);
      }
    }
    expect(describeNotificationStatus({ status: 'DELIVERED', channel: 'EMAIL' }).label).toBe('Delivered');
  });

  it('accepted/submitted copy explicitly says delivery is not confirmed', () => {
    expect(describeNotificationStatus({ status: 'ACCEPTED', channel: 'WHATSAPP' }, 'VERIFICATION_CODE').message).toBe(
      'The WhatsApp provider accepted your verification code. Delivery is not confirmed yet.',
    );
    expect(describeNotificationStatus({ status: 'SUBMITTED', channel: 'EMAIL' }, 'PASSWORD_RESET').message).toBe(
      'We submitted your email password reset message. Delivery is not confirmed yet.',
    );
  });

  it('timeout failure copy says the send could not be confirmed', () => {
    const copy = describeNotificationStatus(
      { status: 'FAILED', channel: 'WHATSAPP', outcomeUnknown: true },
      'WELCOME',
    );
    expect(copy.tone).toBe('danger');
    expect(copy.message).toMatch(/could not confirm/);
  });
});
