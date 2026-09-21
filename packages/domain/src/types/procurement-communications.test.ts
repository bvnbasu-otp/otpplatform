import { describe, expect, it } from 'vitest';
import {
  calculateExponentialBackoff,
  classifyDeliveryFailure,
  computeDeterministicHmac,
  isCategoryOptedOut,
  isChannelEnabled,
  isWithinQuietHours,
  redactNotificationPayload,
  renderNotificationTemplate,
  sanitizeLogData,
  validateProviderWebhookSignature,
  type NotificationPreferences,
} from './procurement-communications';

describe('Omnichannel Procurement Communications Domain Engine', () => {
  it('renders template variables cleanly', () => {
    const tmpl = 'Hello {{name}}, your quote for RFQ {{rfq_number}} is submitted.';
    const rendered = renderNotificationTemplate(tmpl, {
      name: 'Alpha Buyer',
      rfq_number: 'RFQ-2026-001',
    });
    expect(rendered).toBe('Hello Alpha Buyer, your quote for RFQ RFQ-2026-001 is submitted.');
  });

  it('redacts sensitive supplier details when identity is masked', () => {
    const raw = {
      rfq_id: 'rfq-123',
      supplier_legal_name: 'Acme Steel Pvt Ltd',
      supplier_gstin: '29ABCDE1234F1Z5',
      supplier_phone: '+919876543210',
      supplier_label: 'Supplier A7K3',
      amount: 50000,
    };

    const redacted = redactNotificationPayload(raw, true);
    expect(redacted.supplier_legal_name).toBeUndefined();
    expect(redacted.supplier_gstin).toBeUndefined();
    expect(redacted.supplier_phone).toBeUndefined();
    expect(redacted.supplier_pseudonym).toBe('Supplier A7K3');
    expect(redacted.amount).toBe(50000);

    const unmasked = redactNotificationPayload(raw, false);
    expect(unmasked.supplier_legal_name).toBe('Acme Steel Pvt Ltd');
  });

  it('handles channel preferences and category opt-outs', () => {
    const prefs: NotificationPreferences = {
      id: 'pref-1',
      userId: 'usr-1',
      channelPreferences: {
        WHATSAPP: true,
        SMS: false,
        EMAIL: true,
        IN_APP: true,
      },
      categoryOptOuts: ['SYSTEM_ALERT'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(isChannelEnabled(prefs, 'WHATSAPP')).toBe(true);
    expect(isChannelEnabled(prefs, 'SMS')).toBe(false);
    expect(isCategoryOptedOut(prefs, 'SYSTEM_ALERT')).toBe(true);
    expect(isCategoryOptedOut(prefs, 'RFQ_INVITATION')).toBe(false);
  });

  it('correctly detects quiet hours windows', () => {
    // Overnight quiet hours 22:00 to 08:00
    expect(isWithinQuietHours('22:00', '08:00', '23:30')).toBe(true);
    expect(isWithinQuietHours('22:00', '08:00', '04:15')).toBe(true);
    expect(isWithinQuietHours('22:00', '08:00', '14:00')).toBe(false);

    // Daytime quiet hours 13:00 to 15:00
    expect(isWithinQuietHours('13:00', '15:00', '14:00')).toBe(true);
    expect(isWithinQuietHours('13:00', '15:00', '16:00')).toBe(false);
  });

  it('calculates exponential backoff delays with cap', () => {
    expect(calculateExponentialBackoff(0)).toBe(0);
    expect(calculateExponentialBackoff(1, 30, 3600)).toBe(30);
    expect(calculateExponentialBackoff(2, 30, 3600)).toBe(60);
    expect(calculateExponentialBackoff(3, 30, 3600)).toBe(120);
    expect(calculateExponentialBackoff(10, 30, 3600)).toBe(3600); // capped
  });

  it('classifies delivery failure categories accurately', () => {
    expect(classifyDeliveryFailure(new Error('Connection reset by peer'))).toBe('TRANSIENT');
    expect(classifyDeliveryFailure(new Error('Invalid email address format'))).toBe('PERMANENT');
    expect(classifyDeliveryFailure(new Error('Unauthorized: Invalid API Key'), 401)).toBe('CREDENTIAL_ERROR');
    expect(classifyDeliveryFailure(new Error('Rate limited'), 429)).toBe('TRANSIENT');
  });

  it('sanitizes tokens and passwords from logs', () => {
    const rawLog = 'Error contacting gateway: Bearer eyJhbGciOiJIUzI1NiJ9 with password=MySecretPassword123';
    const sanitized = sanitizeLogData(rawLog);
    expect(sanitized).toContain('[REDACTED_TOKEN]');
    expect(sanitized).toContain('[REDACTED_PASS]');
    expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(sanitized).not.toContain('MySecretPassword123');
  });

  it('verifies provider webhook signatures and rejects replay drift', () => {
    const secret = 'waha_webhook_secret_key_123456';
    const rawPayload = JSON.stringify({ event: 'message_delivered', id: 'msg_9988' });
    const now = Date.now();

    const validSig = computeDeterministicHmac(rawPayload, `${secret}:${now}`);

    expect(validateProviderWebhookSignature(rawPayload, validSig, secret, now, 300)).toBe(true);

    // Invalid signature
    expect(validateProviderWebhookSignature(rawPayload, 'wrong_hex_signature', secret, now, 300)).toBe(false);

    // Replay attack with expired timestamp (drift > 300s)
    const oldTimestamp = now - 400000;
    const oldSig = computeDeterministicHmac(rawPayload, `${secret}:${oldTimestamp}`);

    expect(validateProviderWebhookSignature(rawPayload, oldSig, secret, oldTimestamp, 300)).toBe(false);
  });
});
