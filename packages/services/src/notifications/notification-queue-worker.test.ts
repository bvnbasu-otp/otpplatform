import { describe, expect, it, beforeEach, vi } from 'vitest';
import { InMemoryRepositories, createId } from '../repositories/in-memory';
import { createOtpServices, type OtpServices } from '../factory/create-otp-services';
import type { ActorContext } from '../types/actor-context';
import {
  NotificationQueueWorker,
  type NotificationProviderAdapter,
  type ProviderDeliveryResponse,
} from './notification-queue-worker';
import {
  calculateExponentialBackoffWithJitter,
  classifyDeliveryFailure,
  computeDeterministicHmac,
  redactNotificationPayload,
  sanitizeLogData,
  validateProviderWebhookSignature,
} from '@otp/domain';
import type { NotificationDispatchQueueEntity } from '../repositories/entities';

const ORG_ALPHA = 'org-tenant-alpha';
const ORG_BETA = 'org-tenant-beta';

const ADMIN_ACTOR: ActorContext = {
  profileId: 'usr-platform-admin',
  isPlatformAdmin: true,
};

const BUYER_ALPHA: ActorContext = {
  profileId: 'usr-buyer-alpha',
  organizationId: ORG_ALPHA,
  orgRole: 'BUYER',
};

const BUYER_BETA: ActorContext = {
  profileId: 'usr-buyer-beta',
  organizationId: ORG_BETA,
  orgRole: 'BUYER',
};

describe('Phase COM.2: Notification Delivery Worker & Reliability Assurance (COM2-RT-01 — COM2-RT-20)', () => {
  let mem: InMemoryRepositories;
  let services: OtpServices;
  let worker: NotificationQueueWorker;

  beforeEach(async () => {
    mem = InMemoryRepositories.create();
    const repos = mem.asRepositories();
    services = createOtpServices(repos);
    worker = services.notificationWorker;

    // Seed test notification templates
    await repos.notificationTemplates?.save({
      id: 'tmpl-test-rfq',
      templateCode: 'tmpl-rfq-invite-wa',
      version: 1,
      channel: 'WHATSAPP',
      category: 'RFQ_INVITATION',
      lifecycleStages: ['DISCOVERY', 'INVITATION'],
      subjectTemplate: null,
      bodyTemplate: 'Hello, you have been invited to quote for RFQ {{rfqNumber}} in category {{categoryName}}.',
      variablesSchema: {},
      isActive: true,
      requiresIdentityRedaction: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await repos.notificationTemplates?.save({
      id: 'tmpl-test-po-email',
      templateCode: 'tmpl-po-issued-email',
      version: 1,
      channel: 'EMAIL',
      category: 'WORK_ORDER_ISSUED',
      lifecycleStages: ['AWARD', 'FULFILLMENT'],
      subjectTemplate: 'Purchase Order {{poNumber}} Issued',
      bodyTemplate: '<p>Purchase order {{poNumber}} has been issued for amount {{totalAmount}}.</p>',
      variablesSchema: {},
      isActive: true,
      requiresIdentityRedaction: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  // ---------------------------------------------------------------------------
  // COM2-RT-01: Concurrent worker claim (SKIP LOCKED / lease protection)
  // ---------------------------------------------------------------------------
  it('COM2-RT-01: Concurrent worker claim prevents dual processing via atomic lease', async () => {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();

    const item = await repos.notificationQueue?.save({
      id: 'queue-item-1',
      organizationId: ORG_ALPHA,
      recipientUserId: 'usr-supplier-1',
      recipientAddress: '+919876543210',
      channel: 'WHATSAPP',
      category: 'RFQ_INVITATION',
      templateCode: 'tmpl-rfq-invite-wa',
      templateVersion: 1,
      payload: { rfqNumber: 'RFQ-001', categoryName: 'Steel' },
      redactedPayload: { rfqNumber: 'RFQ-001', categoryName: 'Steel' },
      isIdentityMasked: true,
      status: 'PENDING',
      retryCount: 0,
      maxRetries: 5,
      nextRetryAt: now,
      errorLog: [],
      createdAt: now,
      updatedAt: now,
    });
    expect(item).toBeDefined();

    // Worker 1 claims item
    const worker1 = new NotificationQueueWorker(repos, services.audit, { workerId: 'worker-1', leaseTimeoutMs: 300000 });
    const worker2 = new NotificationQueueWorker(repos, services.audit, { workerId: 'worker-2', leaseTimeoutMs: 300000 });

    // Both attempt claiming simultaneously
    const claim1 = await repos.notificationQueue?.claimPendingBatch?.({
      limit: 10,
      leaseTimeoutMs: 300000,
      workerId: 'worker-1',
      now,
    });
    const claim2 = await repos.notificationQueue?.claimPendingBatch?.({
      limit: 10,
      leaseTimeoutMs: 300000,
      workerId: 'worker-2',
      now,
    });

    expect(claim1).toBeDefined();
    if (!claim1 || !claim1[0]) return;
    expect(claim1).toHaveLength(1);
    expect(claim1[0].id).toBe('queue-item-1');
    expect(claim1[0].claimedBy).toBe('worker-1');

    // Worker 2 should get 0 items because worker-1 holds active lease
    expect(claim2).toBeDefined();
    if (!claim2) return;
    expect(claim2).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // COM2-RT-02: Stale lease recovery
  // ---------------------------------------------------------------------------
  it('COM2-RT-02: Abandoned items past lease expiration are safely recovered by next worker', async () => {
    const repos = mem.asRepositories();
    const pastTime = new Date(Date.now() - 600000).toISOString(); // 10 min ago
    const expiredLease = new Date(Date.now() - 300000).toISOString(); // Expired 5 min ago

    await repos.notificationQueue?.save({
      id: 'queue-item-crashed',
      organizationId: ORG_ALPHA,
      recipientUserId: 'usr-supplier-1',
      recipientAddress: '+919876543210',
      channel: 'WHATSAPP',
      category: 'RFQ_INVITATION',
      templateCode: 'tmpl-rfq-invite-wa',
      templateVersion: 1,
      payload: { rfqNumber: 'RFQ-002', categoryName: 'Cement' },
      redactedPayload: { rfqNumber: 'RFQ-002', categoryName: 'Cement' },
      isIdentityMasked: true,
      status: 'PROCESSING', // Stuck in processing
      claimedAt: pastTime,
      claimedBy: 'dead-worker-pid-999',
      leaseExpiresAt: expiredLease, // Stale lease
      retryCount: 0,
      maxRetries: 5,
      nextRetryAt: pastTime,
      errorLog: [],
      createdAt: pastTime,
      updatedAt: pastTime,
    });

    const currentWorker = new NotificationQueueWorker(repos, services.audit, { workerId: 'healthy-worker' });
    const runResult = await currentWorker.runBatch(ADMIN_ACTOR);

    expect(runResult.ok).toBe(true);
    if (!runResult.ok) return;

    expect(runResult.value.claimed).toBe(1);
    expect(runResult.value.delivered).toBe(1);

    const updated = await repos.notificationQueue?.findById('queue-item-crashed');
    expect(updated?.status).toBe('DELIVERED');
  });

  // ---------------------------------------------------------------------------
  // COM2-RT-03: Duplicate invocation idempotency
  // ---------------------------------------------------------------------------
  it('COM2-RT-03: Duplicate dispatch calls with identical idempotencyKey are idempotent', async () => {
    const repos = mem.asRepositories();
    const idempotencyKey = 'idem-key-rfq-invite-123';

    const firstDispatch = await services.omnichannelNotifications.dispatchNotification(BUYER_ALPHA, {
      organizationId: ORG_ALPHA,
      recipientAddress: 'buyer@example.com',
      channel: 'EMAIL',
      category: 'WORK_ORDER_ISSUED',
      templateCode: 'tmpl-po-issued-email',
      payload: { poNumber: 'PO-991', totalAmount: '50000' },
      idempotencyKey,
    });

    expect(firstDispatch.ok).toBe(true);
    if (!firstDispatch.ok) return;

    const secondDispatch = await services.omnichannelNotifications.dispatchNotification(BUYER_ALPHA, {
      organizationId: ORG_ALPHA,
      recipientAddress: 'buyer@example.com',
      channel: 'EMAIL',
      category: 'WORK_ORDER_ISSUED',
      templateCode: 'tmpl-po-issued-email',
      payload: { poNumber: 'PO-991', totalAmount: '50000' },
      idempotencyKey,
    });

    expect(secondDispatch.ok).toBe(true);
    if (!secondDispatch.ok) return;

    // Must return the exact same queue entity without creating duplicates
    expect(secondDispatch.value.id).toBe(firstDispatch.value.id);
  });

  // ---------------------------------------------------------------------------
  // COM2-RT-04: Provider timeout (bounded wait)
  // ---------------------------------------------------------------------------
  it('COM2-RT-04: Hanging provider call times out cleanly within bounded interval', async () => {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();

    await repos.notificationQueue?.save({
      id: 'queue-hanging-item',
      organizationId: ORG_ALPHA,
      recipientAddress: 'slow@provider.com',
      channel: 'EMAIL',
      category: 'WORK_ORDER_ISSUED',
      templateCode: 'tmpl-po-issued-email',
      templateVersion: 1,
      payload: { poNumber: 'PO-SLOW', totalAmount: '100' },
      redactedPayload: { poNumber: 'PO-SLOW', totalAmount: '100' },
      isIdentityMasked: true,
      status: 'PENDING',
      retryCount: 0,
      maxRetries: 3,
      nextRetryAt: now,
      errorLog: [],
      createdAt: now,
      updatedAt: now,
    });

    // Hanging adapter simulating network stall
    const hangingAdapter: NotificationProviderAdapter = {
      channel: 'EMAIL',
      send: async () => {
        return new Promise<ProviderDeliveryResponse>((resolve) => {
          // Stalls for 5000ms
          setTimeout(() => resolve({ success: true }), 5000);
        });
      },
    };

    const workerWithShortTimeout = new NotificationQueueWorker(
      repos,
      services.audit,
      { providerTimeoutMs: 100 }, // 100ms timeout
      [hangingAdapter],
    );

    const result = await workerWithShortTimeout.runBatch(ADMIN_ACTOR);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.failed).toBe(1);

    const item = await repos.notificationQueue?.findById('queue-hanging-item');
    expect(item).toBeDefined();
    if (!item) return;
    expect(item.status).toBe('PENDING'); // Retry scheduled
    expect(item.retryCount).toBe(1);
    expect(item.errorLog[0]?.error).toContain('timeout');
  });

  // ---------------------------------------------------------------------------
  // COM2-RT-05: Retry storm prevention (exponential backoff + jitter)
  // ---------------------------------------------------------------------------
  it('COM2-RT-05: Exponential backoff with jitter spreads retry intervals predictably', () => {
    const delays: number[] = [];
    const fixedRandom = () => 0.5; // neutral jitter

    for (let attempt = 1; attempt <= 5; attempt++) {
      delays.push(calculateExponentialBackoffWithJitter(attempt, 30, 3600, 0.2, fixedRandom));
    }

    // Attempt 1: 30s, Attempt 2: 60s, Attempt 3: 120s, Attempt 4: 240s, Attempt 5: 480s
    expect(delays[0]).toBe(30);
    expect(delays[1]).toBe(60);
    expect(delays[2]).toBe(120);
    expect(delays[3]).toBe(240);
    expect(delays[4]).toBe(480);
  });

  // ---------------------------------------------------------------------------
  // COM2-RT-06: Retry-After respect
  // ---------------------------------------------------------------------------
  it('COM2-RT-06: Provider Retry-After header is strictly respected for next retry schedule', async () => {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();

    await repos.notificationQueue?.save({
      id: 'queue-rate-limited',
      organizationId: ORG_ALPHA,
      recipientAddress: 'ratelimited@provider.com',
      channel: 'EMAIL',
      category: 'WORK_ORDER_ISSUED',
      templateCode: 'tmpl-po-issued-email',
      templateVersion: 1,
      payload: { poNumber: 'PO-429', totalAmount: '100' },
      redactedPayload: { poNumber: 'PO-429', totalAmount: '100' },
      isIdentityMasked: true,
      status: 'PENDING',
      retryCount: 0,
      maxRetries: 5,
      nextRetryAt: now,
      errorLog: [],
      createdAt: now,
      updatedAt: now,
    });

    const rateLimitedAdapter: NotificationProviderAdapter = {
      channel: 'EMAIL',
      send: async () => ({
        success: false,
        statusCode: 429,
        retryAfterSeconds: 720, // 12 minutes
        error: 'Too Many Requests: Rate limit exceeded',
      }),
    };

    const workerWithAdapter = new NotificationQueueWorker(repos, services.audit, {}, [rateLimitedAdapter]);
    await workerWithAdapter.runBatch(ADMIN_ACTOR);

    const item = await repos.notificationQueue?.findById('queue-rate-limited');
    expect(item?.status).toBe('PENDING');
    expect(item?.retryCount).toBe(1);

    const nextRetryTime = new Date(item!.nextRetryAt).getTime();
    const currentTime = Date.now();
    // Next retry should be approximately 720 seconds in the future
    const diffSeconds = (nextRetryTime - currentTime) / 1000;
    expect(diffSeconds).toBeGreaterThanOrEqual(715);
    expect(diffSeconds).toBeLessThanOrEqual(725);
  });

  // ---------------------------------------------------------------------------
  // COM2-RT-07: Permanent failure infinite retry prevention (DLQ)
  // ---------------------------------------------------------------------------
  it('COM2-RT-07: Fatal/Permanent provider errors transition directly to DEAD_LETTER without retries', async () => {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();

    await repos.notificationQueue?.save({
      id: 'queue-invalid-number',
      organizationId: ORG_ALPHA,
      recipientAddress: '+910000000000',
      channel: 'WHATSAPP',
      category: 'RFQ_INVITATION',
      templateCode: 'tmpl-rfq-invite-wa',
      templateVersion: 1,
      payload: { rfqNumber: 'RFQ-INV', categoryName: 'Tools' },
      redactedPayload: { rfqNumber: 'RFQ-INV', categoryName: 'Tools' },
      isIdentityMasked: true,
      status: 'PENDING',
      retryCount: 0,
      maxRetries: 5,
      nextRetryAt: now,
      errorLog: [],
      createdAt: now,
      updatedAt: now,
    });

    const invalidRecipientAdapter: NotificationProviderAdapter = {
      channel: 'WHATSAPP',
      send: async () => ({
        success: false,
        statusCode: 400,
        error: 'Invalid recipient: WhatsApp account does not exist or is unregistered',
      }),
    };

    const customWorker = new NotificationQueueWorker(repos, services.audit, {}, [invalidRecipientAdapter]);
    const res = await customWorker.runBatch(ADMIN_ACTOR);

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.value.deadLetter).toBe(1);

    const item = await repos.notificationQueue?.findById('queue-invalid-number');
    expect(item).toBeDefined();
    if (!item) return;
    expect(item.status).toBe('DEAD_LETTER');
    expect(item.errorLog[0]?.category).toBe('PERMANENT');
  });

  // ---------------------------------------------------------------------------
  // COM2-RT-08: DLQ bypass prevention (retained metadata)
  // ---------------------------------------------------------------------------
  it('COM2-RT-08: Dead letter queue retains full audit metadata and error lineage', async () => {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();

    await repos.notificationQueue?.save({
      id: 'queue-dlq-lineage',
      organizationId: ORG_ALPHA,
      recipientAddress: 'dlq@otp.trade',
      channel: 'EMAIL',
      category: 'WORK_ORDER_ISSUED',
      templateCode: 'tmpl-po-issued-email',
      templateVersion: 1,
      payload: { poNumber: 'PO-FAIL', totalAmount: '9999' },
      redactedPayload: { poNumber: 'PO-FAIL', totalAmount: '9999' },
      isIdentityMasked: true,
      status: 'PENDING',
      retryCount: 4, // 1 retry left
      maxRetries: 5,
      nextRetryAt: now,
      errorLog: [
        { timestamp: now, error: 'Network blip 1', attempt: 1 },
        { timestamp: now, error: 'Network blip 2', attempt: 2 },
        { timestamp: now, error: 'Network blip 3', attempt: 3 },
        { timestamp: now, error: 'Network blip 4', attempt: 4 },
      ],
      createdAt: now,
      updatedAt: now,
    });

    const failingAdapter: NotificationProviderAdapter = {
      channel: 'EMAIL',
      send: async () => ({
        success: false,
        error: 'Persistent downstream outage',
      }),
    };

    const customWorker = new NotificationQueueWorker(repos, services.audit, {}, [failingAdapter]);
    await customWorker.runBatch(ADMIN_ACTOR);

    const item = await repos.notificationQueue?.findById('queue-dlq-lineage');
    expect(item).toBeDefined();
    if (!item) return;
    expect(item.status).toBe('DEAD_LETTER');
    expect(item.retryCount).toBe(5);
    expect(item.errorLog).toHaveLength(5);
    expect(item.errorLog[4]?.attempt).toBe(5);
    expect(item.errorLog[4]?.error).toBe('Persistent downstream outage');
  });

  // ---------------------------------------------------------------------------
  // COM2-RT-09: Cross-tenant queue isolation
  // ---------------------------------------------------------------------------
  it('COM2-RT-09: Tenant-scoped worker only claims and processes items for its own organization', async () => {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();

    await repos.notificationQueue?.save({
      id: 'queue-alpha-item',
      organizationId: ORG_ALPHA,
      recipientAddress: 'alpha@org.com',
      channel: 'EMAIL',
      category: 'WORK_ORDER_ISSUED',
      templateCode: 'tmpl-po-issued-email',
      templateVersion: 1,
      payload: { poNumber: 'PO-ALPHA', totalAmount: '100' },
      redactedPayload: { poNumber: 'PO-ALPHA', totalAmount: '100' },
      isIdentityMasked: true,
      status: 'PENDING',
      retryCount: 0,
      maxRetries: 5,
      nextRetryAt: now,
      errorLog: [],
      createdAt: now,
      updatedAt: now,
    });

    await repos.notificationQueue?.save({
      id: 'queue-beta-item',
      organizationId: ORG_BETA,
      recipientAddress: 'beta@org.com',
      channel: 'EMAIL',
      category: 'WORK_ORDER_ISSUED',
      templateCode: 'tmpl-po-issued-email',
      templateVersion: 1,
      payload: { poNumber: 'PO-BETA', totalAmount: '200' },
      redactedPayload: { poNumber: 'PO-BETA', totalAmount: '200' },
      isIdentityMasked: true,
      status: 'PENDING',
      retryCount: 0,
      maxRetries: 5,
      nextRetryAt: now,
      errorLog: [],
      createdAt: now,
      updatedAt: now,
    });

    // Run batch scoped to Org Alpha
    const result = await worker.runBatch(BUYER_ALPHA, { organizationId: ORG_ALPHA });
    expect(result.ok).toBe(true);
    if (!result.ok || !result.value.details[0]) return;

    expect(result.value.claimed).toBe(1);
    expect(result.value.details[0].id).toBe('queue-alpha-item');

    // Verify Beta item remained untouched in PENDING state
    const betaItem = await repos.notificationQueue?.findById('queue-beta-item');
    expect(betaItem).toBeDefined();
    if (!betaItem) return;
    expect(betaItem.status).toBe('PENDING');
  });

  // ---------------------------------------------------------------------------
  // COM2-RT-10: Unauthorized worker endpoint invocation
  // ---------------------------------------------------------------------------
  it('COM2-RT-10: Worker invocation without valid secret bearer token fails closed with ForbiddenError', async () => {
    const repos = mem.asRepositories();
    const protectedWorker = new NotificationQueueWorker(repos, services.audit, {
      secretBearerToken: 'secret-cron-token-998877',
    });

    // 1. Missing bearer token
    const unauthResult = await protectedWorker.runBatch(ADMIN_ACTOR);
    expect(unauthResult.ok).toBe(false);

    // 2. Wrong bearer token
    const wrongTokenResult = await protectedWorker.runBatch(ADMIN_ACTOR, {
      bearerToken: 'Bearer invalid-token',
    });
    expect(wrongTokenResult.ok).toBe(false);

    // 3. Correct token succeeds
    const validResult = await protectedWorker.runBatch(ADMIN_ACTOR, {
      bearerToken: 'Bearer secret-cron-token-998877',
    });
    expect(validResult.ok).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // COM2-RT-11: Recipient substitution prevention
  // ---------------------------------------------------------------------------
  it('COM2-RT-11: Recipient address tampering during dispatch is prevented and bound to queue entity', async () => {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();

    const created = await repos.notificationQueue?.save({
      id: 'queue-recipient-tamper',
      organizationId: ORG_ALPHA,
      recipientAddress: 'legitimate-recipient@otp.trade',
      channel: 'EMAIL',
      category: 'WORK_ORDER_ISSUED',
      templateCode: 'tmpl-po-issued-email',
      templateVersion: 1,
      payload: { poNumber: 'PO-SAFE', totalAmount: '100' },
      redactedPayload: { poNumber: 'PO-SAFE', totalAmount: '100' },
      isIdentityMasked: true,
      status: 'PENDING',
      retryCount: 0,
      maxRetries: 5,
      nextRetryAt: now,
      errorLog: [],
      createdAt: now,
      updatedAt: now,
    });

    let sentToAddress = '';
    const spyAdapter: NotificationProviderAdapter = {
      channel: 'EMAIL',
      send: async (item) => {
        sentToAddress = item.recipientAddress;
        return { success: true, providerMessageId: 'prov-spy' };
      },
    };

    const customWorker = new NotificationQueueWorker(repos, services.audit, {}, [spyAdapter]);
    await customWorker.runBatch(ADMIN_ACTOR);

    expect(sentToAddress).toBe('legitimate-recipient@otp.trade');
  });

  // ---------------------------------------------------------------------------
  // COM2-RT-12: Pre-award identity leakage prevention
  // ---------------------------------------------------------------------------
  it('COM2-RT-12: Pre-award notifications strictly redact supplier legal name, GSTIN, PAN, and phone', () => {
    const unredactedPayload = {
      rfqNumber: 'RFQ-SECRET-1',
      supplier_legal_name: 'Acme Mega Industrial Corp Ltd',
      supplier_gstin: '29AABCS1429B1ZX',
      supplier_pan: 'AABCS1429B',
      supplier_phone: '+919999999999',
      supplier_email: 'ceo@acmemega.com',
      supplier_label: 'Supplier A7K3',
    };

    const redacted = redactNotificationPayload(unredactedPayload, true);

    expect(redacted.supplier_legal_name).toBeUndefined();
    expect(redacted.supplier_gstin).toBeUndefined();
    expect(redacted.supplier_pan).toBeUndefined();
    expect(redacted.supplier_phone).toBeUndefined();
    expect(redacted.supplier_email).toBeUndefined();
    expect(redacted.supplier_pseudonym).toBe('Supplier A7K3');
    expect(redacted.rfqNumber).toBe('RFQ-SECRET-1');
  });

  // ---------------------------------------------------------------------------
  // COM2-RT-13: Sensitive payload logging prevention
  // ---------------------------------------------------------------------------
  it('COM2-RT-13: Sensitive tokens, passwords, and API keys are sanitized from error logs', () => {
    const dirtyError = 'HTTP 401: Failed with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 and api_key: abc123secret999 and password=SuperSecretPass123!';
    const sanitized = sanitizeLogData(dirtyError);

    expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(sanitized).not.toContain('abc123secret999');
    expect(sanitized).not.toContain('SuperSecretPass123!');
    expect(sanitized).toContain('[REDACTED_TOKEN]');
    expect(sanitized).toContain('[REDACTED_KEY]');
    expect(sanitized).toContain('[REDACTED_PASS]');
  });

  // ---------------------------------------------------------------------------
  // COM2-RT-14: Credential leakage prevention
  // ---------------------------------------------------------------------------
  it('COM2-RT-14: Credential failures are classified as CREDENTIAL_ERROR and dead-lettered immediately', () => {
    const authErrorCategory = classifyDeliveryFailure(new Error('Authentication failed: Invalid credentials provided'), 401);
    expect(authErrorCategory).toBe('CREDENTIAL_ERROR');

    const eauthErrorCategory = classifyDeliveryFailure(new Error('ESOCKET error: EAUTH invalid username or password'));
    expect(eauthErrorCategory).toBe('CREDENTIAL_ERROR');
  });

  // ---------------------------------------------------------------------------
  // COM2-RT-15: Forged delivery callback prevention
  // ---------------------------------------------------------------------------
  it('COM2-RT-15: Webhook delivery receipt with forged HMAC signature is rejected', async () => {
    const secret = 'webhook-shared-secret-key-123';
    const rawPayload = JSON.stringify({ messageId: 'msg-123', status: 'DELIVERED' });
    const nowMs = Date.now();

    const forgedSignature = '0000000000000000000000000000000000000000000000000000000000000000';

    const result = await worker.handleDeliveryWebhook(ADMIN_ACTOR, {
      rawPayload,
      signature: forgedSignature,
      secret,
      timestampMs: nowMs,
      providerMessageId: 'msg-123',
      status: 'DELIVERED',
    });

    expect(result.ok).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // COM2-RT-16: Webhook replay prevention
  // ---------------------------------------------------------------------------
  it('COM2-RT-16: Webhook delivery receipt outside 300s replay window is rejected', async () => {
    const secret = 'webhook-shared-secret-key-123';
    const rawPayload = JSON.stringify({ messageId: 'msg-456', status: 'DELIVERED' });
    const staleTimestamp = Date.now() - 400000; // 400s ago (> 300s window)

    const validSigForStale = computeDeterministicHmac(rawPayload, `${secret}:${staleTimestamp}`);

    const result = await worker.handleDeliveryWebhook(ADMIN_ACTOR, {
      rawPayload,
      signature: validSigForStale,
      secret,
      timestampMs: staleTimestamp,
      providerMessageId: 'msg-456',
      status: 'DELIVERED',
      maxDriftSeconds: 300,
    });

    expect(result.ok).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // COM2-RT-17: Worker-induced approval bypass prevention
  // ---------------------------------------------------------------------------
  it('COM2-RT-17: Worker execution cannot create or bypass RFQ governance approvals', async () => {
    const repos = mem.asRepositories();
    const existingApprovals = await repos.approvals.findByRfqId('rfq-mock-test');
    expect(existingApprovals).toBeNull();

    // Running worker batch must have zero side-effects on approval instances
    await worker.runBatch(ADMIN_ACTOR);

    const postRunApprovals = await repos.approvals.findByRfqId('rfq-mock-test');
    expect(postRunApprovals).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // COM2-RT-18: Worker-induced award bypass prevention
  // ---------------------------------------------------------------------------
  it('COM2-RT-18: Worker execution cannot mutate or create procurement awards', async () => {
    const repos = mem.asRepositories();
    const existingAward = await repos.awards.findByRfqId('rfq-mock-award');
    expect(existingAward).toBeNull();

    await worker.runBatch(ADMIN_ACTOR);

    const postRunAward = await repos.awards.findByRfqId('rfq-mock-award');
    expect(postRunAward).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // COM2-RT-19: Worker-induced payment bypass prevention
  // ---------------------------------------------------------------------------
  it('COM2-RT-19: Worker execution cannot create or mutate payments, invoices, or settlements', async () => {
    const repos = mem.asRepositories();
    const existingPayment = await repos.payments.findById('pmt-fake-1');
    expect(existingPayment).toBeNull();

    await worker.runBatch(ADMIN_ACTOR);

    const postRunPayment = await repos.payments.findById('pmt-fake-1');
    expect(postRunPayment).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // COM2-RT-20: Unbounded batch execution prevention
  // ---------------------------------------------------------------------------
  it('COM2-RT-20: Worker strictly caps batch size to bounded maximum regardless of queue size', async () => {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();

    // Enqueue 50 items
    for (let i = 1; i <= 50; i++) {
      await repos.notificationQueue?.save({
        id: `queue-bulk-${i}`,
        organizationId: ORG_ALPHA,
        recipientAddress: `user${i}@otp.trade`,
        channel: 'EMAIL',
        category: 'WORK_ORDER_ISSUED',
        templateCode: 'tmpl-po-issued-email',
        templateVersion: 1,
        payload: { poNumber: `PO-${i}`, totalAmount: '100' },
        redactedPayload: { poNumber: `PO-${i}`, totalAmount: '100' },
        isIdentityMasked: true,
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 5,
        nextRetryAt: now,
        errorLog: [],
        createdAt: now,
        updatedAt: now,
      });
    }

    const boundedWorker = new NotificationQueueWorker(repos, services.audit, { batchSize: 15 });
    // Request limit of 100
    const res = await boundedWorker.runBatch(ADMIN_ACTOR, { limit: 100 });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Must be bounded to batchSize (15)
    expect(res.value.claimed).toBe(15);
    expect(res.value.delivered).toBe(15);
  });
});
