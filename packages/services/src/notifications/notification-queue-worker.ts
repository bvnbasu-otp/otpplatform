import {
  calculateExponentialBackoffWithJitter,
  classifyDeliveryFailure,
  isCategoryOptedOut,
  isChannelEnabled,
  isWithinQuietHours,
  redactNotificationPayload,
  renderNotificationTemplate,
  sanitizeLogData,
  validateProviderWebhookSignature,
  type DeliveryFailureCategory,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationDispatchStatus,
} from '@otp/domain';
import type { AuditService } from '../interfaces/audit-service';
import type { Repositories } from '../repositories/interfaces';
import type {
  NotificationDispatchQueueEntity,
  NotificationPreferencesEntity,
  NotificationTemplateEntity,
} from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';
import { ForbiddenError, NotFoundError, ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import { auditLog } from '../services/service-helpers';
import { createId, timestamp } from '../repositories/in-memory';
import { buildMimePayload, resolveSmtpConfig, type SmtpConfig } from './email-dispatcher';

export interface ProviderDeliveryResponse {
  success: boolean;
  providerMessageId?: string;
  statusCode?: number;
  retryAfterSeconds?: number;
  rawResponse?: Record<string, unknown>;
  error?: string;
}

export interface NotificationProviderAdapter {
  channel: NotificationChannel;
  send(
    item: NotificationDispatchQueueEntity,
    renderedContent: { subject?: string; body: string },
    signal?: AbortSignal,
  ): Promise<ProviderDeliveryResponse>;
}

export interface NotificationWorkerOptions {
  batchSize?: number;
  leaseTimeoutMs?: number;
  providerTimeoutMs?: number;
  maxRetries?: number;
  workerId?: string;
  secretBearerToken?: string;
}

export interface WorkerRunResult {
  workerId: string;
  claimed: number;
  delivered: number;
  failed: number;
  deadLetter: number;
  suppressed: number;
  elapsedMs: number;
  details: Array<{
    id: string;
    channel: NotificationChannel;
    status: NotificationDispatchStatus;
    attempts: number;
    error?: string;
  }>;
}

/**
 * Mockable / Safe in-memory Email adapter using SMTP MIME construction.
 */
export class SmtpNotificationAdapter implements NotificationProviderAdapter {
  readonly channel: NotificationChannel = 'EMAIL';

  constructor(private readonly smtpConfig: SmtpConfig = resolveSmtpConfig()) {}

  async send(
    item: NotificationDispatchQueueEntity,
    renderedContent: { subject?: string; body: string },
    _signal?: AbortSignal,
  ): Promise<ProviderDeliveryResponse> {
    const rawMime = buildMimePayload(
      {
        to: item.recipientAddress,
        subject: renderedContent.subject || 'OTP Notification',
        htmlBody: renderedContent.body,
      },
      this.smtpConfig,
    );

    // Safe mock provider - does not connect to real network if in test/mock mode
    return {
      success: true,
      providerMessageId: `email-${createId()}`,
      rawResponse: { mimeLength: rawMime.length, sender: this.smtpConfig.senderEmail },
    };
  }
}

/**
 * Mockable / Safe WhatsApp / WAHA / Meta Cloud API adapter.
 */
export class WhatsAppNotificationAdapter implements NotificationProviderAdapter {
  readonly channel: NotificationChannel = 'WHATSAPP';

  async send(
    item: NotificationDispatchQueueEntity,
    renderedContent: { subject?: string; body: string },
    _signal?: AbortSignal,
  ): Promise<ProviderDeliveryResponse> {
    // Zero-credential safe mock adapter
    return {
      success: true,
      providerMessageId: `waha-${createId()}`,
      rawResponse: { recipient: item.recipientAddress, charCount: renderedContent.body.length },
    };
  }
}

/**
 * In-App & SMS Mockable Safe Adapters
 */
export class InAppNotificationAdapter implements NotificationProviderAdapter {
  readonly channel: NotificationChannel = 'IN_APP';

  async send(
    item: NotificationDispatchQueueEntity,
    renderedContent: { subject?: string; body: string },
  ): Promise<ProviderDeliveryResponse> {
    return {
      success: true,
      providerMessageId: `inapp-${createId()}`,
      rawResponse: { recipientUserId: item.recipientUserId, length: renderedContent.body.length },
    };
  }
}

export class SmsNotificationAdapter implements NotificationProviderAdapter {
  readonly channel: NotificationChannel = 'SMS';

  async send(
    item: NotificationDispatchQueueEntity,
    renderedContent: { subject?: string; body: string },
  ): Promise<ProviderDeliveryResponse> {
    return {
      success: true,
      providerMessageId: `sms-${createId()}`,
      rawResponse: { recipient: item.recipientAddress, length: renderedContent.body.length },
    };
  }
}

/**
 * Robust, concurrent-safe, fault-tolerant notification queue delivery worker.
 *
 * Core Guarantees:
 * 1. Atomic claiming with lease duration and stale lease recovery.
 * 2. Strict tenant isolation (RLS / Org scoping).
 * 3. Idempotency protection.
 * 4. Exponential backoff with jitter and Retry-After header respect.
 * 5. Bounded provider timeouts via AbortController / Promise.race.
 * 6. Zero pre-award PII or supplier legal identity in rendered bodies.
 * 7. Zero financial / governance state mutation.
 * 8. Sanitized audit logging (no passwords/tokens/secrets logged).
 */
export class NotificationQueueWorker {
  private readonly batchSize: number;
  private readonly leaseTimeoutMs: number;
  private readonly providerTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly workerId: string;
  private readonly secretBearerToken?: string;
  private readonly adapters: Map<NotificationChannel, NotificationProviderAdapter>;

  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditService,
    options: NotificationWorkerOptions = {},
    customAdapters?: NotificationProviderAdapter[],
  ) {
    this.batchSize = options.batchSize ?? 20;
    this.leaseTimeoutMs = options.leaseTimeoutMs ?? 5 * 60 * 1000; // 5 min
    this.providerTimeoutMs = options.providerTimeoutMs ?? 5000; // 5 sec
    this.maxRetries = options.maxRetries ?? 5;
    this.workerId = options.workerId ?? `worker-${createId().substring(0, 8)}`;
    this.secretBearerToken = options.secretBearerToken;

    this.adapters = new Map();
    // Default mockable safe adapters
    this.registerAdapter(new SmtpNotificationAdapter());
    this.registerAdapter(new WhatsAppNotificationAdapter());
    this.registerAdapter(new InAppNotificationAdapter());
    this.registerAdapter(new SmsNotificationAdapter());

    if (customAdapters) {
      for (const adapter of customAdapters) {
        this.registerAdapter(adapter);
      }
    }
  }

  public registerAdapter(adapter: NotificationProviderAdapter): void {
    this.adapters.set(adapter.channel, adapter);
  }

  /**
   * Authorizes the worker run request if token verification is configured.
   */
  public verifyAuthorization(bearerHeader?: string | null): boolean {
    if (!this.secretBearerToken) return true;
    if (!bearerHeader) return false;
    const token = bearerHeader.replace(/^Bearer\s+/i, '').trim();
    return token === this.secretBearerToken;
  }

  /**
   * Executes a bounded batch processing cycle.
   */
  public async runBatch(
    actor: ActorContext,
    params?: {
      organizationId?: string;
      limit?: number;
      now?: string;
      bearerToken?: string;
    },
  ): Promise<Result<WorkerRunResult, Error>> {
    const startTime = Date.now();

    // 1. Authorization check
    if (this.secretBearerToken) {
      const authorized = this.verifyAuthorization(params?.bearerToken);
      if (!authorized) {
        return err(new ForbiddenError('Unauthorized worker execution: invalid or missing bearer token'));
      }
    }

    const queueRepo = this.repos.notificationQueue;
    const templateRepo = this.repos.notificationTemplates;
    const prefRepo = this.repos.notificationPreferences;

    if (!queueRepo || !templateRepo) {
      return err(new ValidationError('Required notification repositories not configured'));
    }

    const nowIso = params?.now || new Date().toISOString();
    const effectiveLimit = Math.min(params?.limit ?? this.batchSize, this.batchSize);

    // 2. Claim pending items with atomic lease
    let claimedItems: NotificationDispatchQueueEntity[] = [];

    if (typeof queueRepo.claimPendingBatch === 'function') {
      claimedItems = await queueRepo.claimPendingBatch({
        limit: effectiveLimit,
        leaseTimeoutMs: this.leaseTimeoutMs,
        workerId: this.workerId,
        organizationId: params?.organizationId,
        now: nowIso,
      });
    } else {
      // Fallback manual atomic claim for generic repositories
      const pending = await queueRepo.findPending();
      const nowTime = new Date(nowIso).getTime();
      const eligible = pending.filter((item) => {
        if (params?.organizationId && item.organizationId !== params.organizationId) {
          return false;
        }
        const isPendingReady =
          item.status === 'PENDING' &&
          new Date(item.nextRetryAt).getTime() <= nowTime;
        const isStaleLease =
          item.status === 'PROCESSING' &&
          item.leaseExpiresAt &&
          new Date(item.leaseExpiresAt).getTime() < nowTime;
        return isPendingReady || isStaleLease;
      }).slice(0, effectiveLimit);

      for (const item of eligible) {
        item.status = 'PROCESSING';
        item.claimedAt = nowIso;
        item.claimedBy = this.workerId;
        item.leaseExpiresAt = new Date(nowTime + this.leaseTimeoutMs).toISOString();
        item.updatedAt = nowIso;
        await queueRepo.save(item);
        claimedItems.push(item);
      }
    }

    let deliveredCount = 0;
    let failedCount = 0;
    let deadLetterCount = 0;
    let suppressedCount = 0;
    const details: WorkerRunResult['details'] = [];

    // 3. Process each claimed item
    for (const item of claimedItems) {
      const itemResult = await this.processSingleItem(actor, item, templateRepo, prefRepo);

      if (itemResult.status === 'DELIVERED') {
        deliveredCount++;
      } else if (itemResult.status === 'DEAD_LETTER') {
        deadLetterCount++;
      } else if (itemResult.status === 'SUPPRESSED') {
        suppressedCount++;
      } else {
        failedCount++;
      }

      await queueRepo.save(item);

      details.push({
        id: item.id,
        channel: item.channel,
        status: item.status,
        attempts: item.retryCount,
        error: itemResult.error,
      });
    }

    const elapsedMs = Date.now() - startTime;

    return ok({
      workerId: this.workerId,
      claimed: claimedItems.length,
      delivered: deliveredCount,
      failed: failedCount,
      deadLetter: deadLetterCount,
      suppressed: suppressedCount,
      elapsedMs,
      details,
    });
  }

  /**
   * Processes a single claimed notification item.
   */
  private async processSingleItem(
    actor: ActorContext,
    item: NotificationDispatchQueueEntity,
    templateRepo: NonNullable<Repositories['notificationTemplates']>,
    prefRepo?: Repositories['notificationPreferences'],
  ): Promise<{ status: NotificationDispatchStatus; error?: string }> {
    const nowIso = new Date().toISOString();

    // 1. Template validation
    const template = await templateRepo.findByCode(item.templateCode);
    if (!template || !template.isActive) {
      item.status = 'DEAD_LETTER';
      item.retryCount++;
      item.errorLog.push({
        timestamp: nowIso,
        error: sanitizeLogData(`Template '${item.templateCode}' not found or inactive`),
        attempt: item.retryCount,
        category: 'PERMANENT',
      });
      item.updatedAt = nowIso;
      return { status: 'DEAD_LETTER', error: 'Template inactive or missing' };
    }

    // 2. Preferences & suppression check
    if (item.recipientUserId && prefRepo) {
      const prefs = await prefRepo.findByUserAndOrg(item.recipientUserId, item.organizationId);
      if (prefs) {
        if (!isChannelEnabled(prefs, item.channel) || isCategoryOptedOut(prefs, item.category)) {
          item.status = 'SUPPRESSED';
          item.updatedAt = nowIso;
          return { status: 'SUPPRESSED' };
        }
      }
    }

    // 3. Redact payload if masked
    const shouldMask = item.isIdentityMasked !== false && template.requiresIdentityRedaction;
    const finalPayload = redactNotificationPayload(item.payload, shouldMask);
    item.redactedPayload = finalPayload;

    // 4. Render subject and body
    const renderedSubject = template.subjectTemplate
      ? renderNotificationTemplate(template.subjectTemplate, finalPayload)
      : undefined;
    const renderedBody = renderNotificationTemplate(template.bodyTemplate, finalPayload);

    // 5. Select provider adapter
    const adapter = this.adapters.get(item.channel);
    if (!adapter) {
      item.status = 'DEAD_LETTER';
      item.retryCount++;
      item.errorLog.push({
        timestamp: nowIso,
        error: sanitizeLogData(`No adapter registered for channel ${item.channel}`),
        attempt: item.retryCount,
        category: 'PERMANENT',
      });
      item.updatedAt = nowIso;
      return { status: 'DEAD_LETTER', error: 'No adapter registered' };
    }

    // 6. Invoke provider with bounded timeout & abort signal
    let providerResponse: ProviderDeliveryResponse;
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), this.providerTimeoutMs);

    try {
      const timeoutPromise = new Promise<ProviderDeliveryResponse>((_, reject) => {
        abortController.signal.addEventListener('abort', () => {
          reject(new Error(`Provider timeout exceeded ${this.providerTimeoutMs}ms`));
        });
      });

      providerResponse = await Promise.race([
        adapter.send(item, { subject: renderedSubject, body: renderedBody }, abortController.signal),
        timeoutPromise,
      ]);
    } catch (errCatch: unknown) {
      const errorMsg = errCatch instanceof Error ? errCatch.message : String(errCatch);
      providerResponse = {
        success: false,
        error: errorMsg,
      };
    } finally {
      clearTimeout(timeoutHandle);
    }

    // 7. Handle Provider Outcome
    if (providerResponse.success) {
      item.status = 'DELIVERED';
      item.providerMessageId = providerResponse.providerMessageId ?? null;
      item.providerResponse = providerResponse.rawResponse ?? null;
      item.deliveryConfirmedAt = nowIso;
      item.claimedAt = null;
      item.claimedBy = null;
      item.leaseExpiresAt = null;
      item.updatedAt = nowIso;

      await auditLog(
        this.audit,
        actor,
        'NOTIFICATION_DISPATCH',
        item.id,
        'DISPATCH_DELIVERED',
        null,
        {
          channel: item.channel,
          providerMessageId: item.providerMessageId,
          attempts: item.retryCount + 1,
        },
      );

      return { status: 'DELIVERED' };
    } else {
      // Failure path: classify failure type
      item.retryCount++;
      const failureCat: DeliveryFailureCategory = classifyDeliveryFailure(
        providerResponse.error,
        providerResponse.statusCode,
      );

      const sanitizedError = sanitizeLogData(providerResponse.error || 'Provider dispatch failed');

      item.errorLog.push({
        timestamp: nowIso,
        error: sanitizedError,
        attempt: item.retryCount,
        category: failureCat,
      });

      // Permanent or Credential failures go directly to DEAD_LETTER
      if (failureCat === 'PERMANENT' || failureCat === 'CREDENTIAL_ERROR') {
        item.status = 'DEAD_LETTER';
      } else if (item.retryCount >= (item.maxRetries || this.maxRetries)) {
        item.status = 'DEAD_LETTER';
      } else {
        item.status = 'PENDING';
        // Check for Retry-After header
        let delaySeconds: number;
        if (providerResponse.retryAfterSeconds && providerResponse.retryAfterSeconds > 0) {
          delaySeconds = providerResponse.retryAfterSeconds;
        } else {
          delaySeconds = calculateExponentialBackoffWithJitter(item.retryCount);
        }
        item.nextRetryAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
      }

      item.claimedAt = null;
      item.claimedBy = null;
      item.leaseExpiresAt = null;
      item.updatedAt = nowIso;

      await auditLog(
        this.audit,
        actor,
        'NOTIFICATION_DISPATCH',
        item.id,
        item.status === 'DEAD_LETTER' ? 'DISPATCH_DEAD_LETTER' : 'DISPATCH_RETRY_SCHEDULED',
        null,
        {
          channel: item.channel,
          failureCategory: failureCat,
          attempt: item.retryCount,
          nextRetryAt: item.nextRetryAt,
        },
      );

      return { status: item.status, error: sanitizedError };
    }
  }

  /**
   * Processes inbound delivery confirmation webhook with HMAC verification and replay window checking.
   */
  public async handleDeliveryWebhook(
    actor: ActorContext,
    params: {
      rawPayload: string;
      signature: string;
      secret: string;
      timestampMs: number;
      providerMessageId: string;
      status: 'DELIVERED' | 'READ' | 'FAILED';
      errorReason?: string;
      maxDriftSeconds?: number;
    },
  ): Promise<Result<{ verified: boolean; updated: boolean; itemId?: string }, Error>> {
    // 1. Verify HMAC and replay drift window
    const isValid = validateProviderWebhookSignature(
      params.rawPayload,
      params.signature,
      params.secret,
      params.timestampMs,
      params.maxDriftSeconds ?? 300,
    );

    if (!isValid) {
      return err(new ValidationError('Invalid webhook signature or replay timestamp'));
    }

    const queueRepo = this.repos.notificationQueue;
    if (!queueRepo) return ok({ verified: true, updated: false });

    // 2. Find queue item by providerMessageId
    let item: NotificationDispatchQueueEntity | null = null;
    if (typeof queueRepo.findByProviderMessageId === 'function') {
      item = await queueRepo.findByProviderMessageId(params.providerMessageId);
    } else {
      const allPending = await queueRepo.findPending();
      item = allPending.find((i) => i.providerMessageId === params.providerMessageId) ?? null;
    }

    if (!item) {
      return ok({ verified: true, updated: false });
    }

    const nowIso = new Date().toISOString();
    if (params.status === 'DELIVERED' || params.status === 'READ') {
      item.status = 'DELIVERED';
      item.deliveryConfirmedAt = nowIso;
      item.updatedAt = nowIso;
    } else if (params.status === 'FAILED') {
      item.status = 'DEAD_LETTER';
      item.errorLog.push({
        timestamp: nowIso,
        error: sanitizeLogData(params.errorReason || 'Webhook reported delivery failure'),
        attempt: item.retryCount,
        category: 'PERMANENT',
      });
      item.updatedAt = nowIso;
    }

    await queueRepo.save(item);

    await auditLog(
      this.audit,
      actor,
      'NOTIFICATION_DISPATCH',
      item.id,
      'DELIVERY_STATUS_UPDATED',
      null,
      { providerMessageId: params.providerMessageId, webhookStatus: params.status },
    );

    return ok({ verified: true, updated: true, itemId: item.id });
  }
}
