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
  type TruthfulDeliveryStateRecord,
  validateNotificationStateTransition,
  transitionTruthfulNotificationState,
  buildNotificationIdempotencyKey,
  evaluateChannelOperationalStatus,
  assertNotificationContentSafe,
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

  describe('Truthful 8-State Delivery Lifecycle & Identity Protection', () => {
    it('enforces canonical 8-state sequence CREATED -> DISPATCH_REQUESTED -> PROVIDER_ACCEPTED -> DELIVERED -> OPENED -> CLAIMED', () => {
      const idKey = buildNotificationIdempotencyKey('evt-1001', 'supplier-99', 'RFQ_INVITE', 'WHATSAPP');
      expect(idKey).toBe('evt-1001:supplier-99:RFQ_INVITE:WHATSAPP');

      let record: TruthfulDeliveryStateRecord = {
        id: 'notif-state-1',
        domainEventId: 'evt-1001',
        idempotencyKey: idKey,
        channel: 'WHATSAPP',
        channelStatus: 'LIVE',
        state: 'CREATED',
        stateHistory: [{ state: 'CREATED', timestamp: new Date().toISOString() }],
        recipientAddress: '+919876543210',
        templateCode: 'tmpl-rfq-invite-wa',
        isIdentityMasked: true,
        retryCount: 0,
        maxRetries: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // 1. CREATED -> DISPATCH_REQUESTED
      let res = transitionTruthfulNotificationState(record, 'DISPATCH_REQUESTED');
      expect(res.success).toBe(true);
      record = res.record;
      expect(record.state).toBe('DISPATCH_REQUESTED');

      // 2. DISPATCH_REQUESTED -> PROVIDER_ACCEPTED
      res = transitionTruthfulNotificationState(record, 'PROVIDER_ACCEPTED', {
        providerMessageId: 'waha-msg-555',
      });
      expect(res.success).toBe(true);
      record = res.record;
      expect(record.state).toBe('PROVIDER_ACCEPTED');
      expect(record.providerMessageId).toBe('waha-msg-555');

      // 3. PROVIDER_ACCEPTED -> DELIVERED
      res = transitionTruthfulNotificationState(record, 'DELIVERED');
      expect(res.success).toBe(true);
      record = res.record;
      expect(record.state).toBe('DELIVERED');
      expect(record.deliveredAt).toBeDefined();

      // 4. DELIVERED -> OPENED
      res = transitionTruthfulNotificationState(record, 'OPENED');
      expect(res.success).toBe(true);
      record = res.record;
      expect(record.state).toBe('OPENED');
      expect(record.openedAt).toBeDefined();

      // 5. OPENED -> CLAIMED
      res = transitionTruthfulNotificationState(record, 'CLAIMED');
      expect(res.success).toBe(true);
      record = res.record;
      expect(record.state).toBe('CLAIMED');
      expect(record.claimedAt).toBeDefined();
    });

    it('rejects illegal state downgrades and illegal state jumps', () => {
      const record: TruthfulDeliveryStateRecord = {
        id: 'notif-state-2',
        domainEventId: 'evt-1002',
        idempotencyKey: 'evt-1002:user-1:ALERT:IN_APP',
        channel: 'IN_APP',
        channelStatus: 'LIVE',
        state: 'DELIVERED',
        stateHistory: [],
        recipientAddress: 'usr-1',
        templateCode: 'tmpl-alert',
        isIdentityMasked: false,
        retryCount: 0,
        maxRetries: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Downgrade: DELIVERED -> CREATED rejected
      const downgrade = transitionTruthfulNotificationState(record, 'CREATED');
      expect(downgrade.success).toBe(false);
      expect(downgrade.error).toContain('Illegal notification state transition');

      // Illegal skip: CREATED -> OPENED rejected
      const createdRecord = { ...record, state: 'CREATED' as const };
      const illegalSkip = transitionTruthfulNotificationState(createdRecord, 'OPENED');
      expect(illegalSkip.success).toBe(false);
      expect(illegalSkip.error).toContain('Illegal notification state transition');
    });

    it('evaluates channel operational status truthfully (LIVE, READY, DISABLED, UNAVAILABLE)', () => {
      expect(evaluateChannelOperationalStatus('IN_APP', { isEnabled: true })).toBe('LIVE');
      expect(evaluateChannelOperationalStatus('WHATSAPP', { isEnabled: false })).toBe('DISABLED');
      expect(evaluateChannelOperationalStatus('SMS', { isEnabled: true, hasCredentials: false })).toBe('UNAVAILABLE');
      expect(evaluateChannelOperationalStatus('EMAIL', { isEnabled: true, hasCredentials: false, isMock: true })).toBe('READY');
      expect(evaluateChannelOperationalStatus('EMAIL', { isEnabled: true, hasCredentials: true })).toBe('LIVE');
    });

    it('asserts pre-award notification payloads prevent buyer identity and competitor quote leaks', () => {
      const safePayload = {
        rfq_number: 'RFQ-2026-009',
        category_name: 'Elevator Maintenance',
        supplier_pseudonym: 'Supplier A7K3',
        target_pincode: '560001',
      };
      const safeCheck = assertNotificationContentSafe(safePayload, true);
      expect(safeCheck.isSafe).toBe(true);
      expect(safeCheck.violations).toHaveLength(0);

      const leakyPayload = {
        rfq_number: 'RFQ-2026-009',
        buyer_name: 'Brigade Gateway RWA President',
        buyer_phone: '+919876543210',
        competitor_name: 'Otis Elevators India Ltd',
        competing_quotes: [450000, 480000],
      };
      const leakyCheck = assertNotificationContentSafe(leakyPayload, true);
      expect(leakyCheck.isSafe).toBe(false);
      expect(leakyCheck.violations.length).toBeGreaterThanOrEqual(2);
    });
  });
});

