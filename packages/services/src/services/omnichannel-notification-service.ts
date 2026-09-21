import {
  calculateExponentialBackoff,
  isCategoryOptedOut,
  isChannelEnabled,
  isWithinQuietHours,
  redactNotificationPayload,
  renderNotificationTemplate,
  validateProviderWebhookSignature,
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
import { auditLog, requireOrgAccess } from './service-helpers';
import { createId, timestamp } from '../repositories/in-memory';

export interface DispatchNotificationInput {
  recipientUserId?: string | null;
  recipientAddress: string;
  channel: NotificationChannel;
  category: NotificationCategory;
  templateCode: string;
  payload: Record<string, unknown>;
  organizationId?: string | null;
  idempotencyKey?: string | null;
  isIdentityMasked?: boolean;
}

export interface UpdatePreferencesInput {
  channelPreferences?: Record<NotificationChannel, boolean>;
  categoryOptOuts?: NotificationCategory[];
  phoneNumber?: string | null;
  email?: string | null;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  organizationId?: string | null;
}

export class OmnichannelNotificationService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditService,
  ) {}

  /**
   * Dispatches or enqueues a notification with template validation, identity redaction,
   * preference opt-out checks, and idempotency protection.
   */
  async dispatchNotification(
    actor: ActorContext,
    input: DispatchNotificationInput,
  ): Promise<Result<NotificationDispatchQueueEntity, Error>> {
    const queueRepo = this.repos.notificationQueue;
    const templateRepo = this.repos.notificationTemplates;
    const prefRepo = this.repos.notificationPreferences;

    if (!queueRepo || !templateRepo) {
      return err(new ValidationError('Notification repositories not configured'));
    }

    // 1. Idempotency check
    if (input.idempotencyKey) {
      const existing = await queueRepo.findByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        return ok(existing);
      }
    }

    // 2. Template verification
    const template = await templateRepo.findByCode(input.templateCode);
    if (!template || !template.isActive) {
      return err(new NotFoundError(`Active notification template '${input.templateCode}' not found`));
    }

    // 3. User Preference verification
    let status: NotificationDispatchStatus = 'PENDING';
    if (input.recipientUserId && prefRepo) {
      const prefs = await prefRepo.findByUserAndOrg(input.recipientUserId, input.organizationId);
      if (prefs) {
        if (!isChannelEnabled(prefs, input.channel) || isCategoryOptedOut(prefs, input.category)) {
          status = 'SUPPRESSED';
        }
      }
    }

    // 4. Identity Redaction
    const shouldMask = input.isIdentityMasked !== false && template.requiresIdentityRedaction;
    const redactedPayload = redactNotificationPayload(input.payload, shouldMask);

    const now = timestamp();
    const item: NotificationDispatchQueueEntity = {
      id: createId(),
      organizationId: input.organizationId ?? actor.organizationId ?? null,
      recipientUserId: input.recipientUserId ?? null,
      recipientAddress: input.recipientAddress,
      channel: input.channel,
      category: input.category,
      templateCode: input.templateCode,
      templateVersion: template.version,
      payload: input.payload,
      redactedPayload,
      isIdentityMasked: shouldMask,
      status,
      retryCount: 0,
      maxRetries: 5,
      nextRetryAt: now,
      errorLog: [],
      idempotencyKey: input.idempotencyKey ?? null,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await queueRepo.save(item);

    await auditLog(
      this.audit,
      actor,
      'NOTIFICATION_DISPATCH',
      saved.id,
      'DISPATCH_ENQUEUED',
      null,
      { status: saved.status, channel: saved.channel, templateCode: saved.templateCode },
    );

    return ok(saved);
  }

  /**
   * Updates notification preferences for a user / organization.
   */
  async updatePreferences(
    actor: ActorContext,
    userId: string,
    input: UpdatePreferencesInput,
  ): Promise<Result<NotificationPreferencesEntity, Error>> {
    const prefRepo = this.repos.notificationPreferences;
    if (!prefRepo) return err(new ValidationError('Preferences repository not configured'));

    if (!actor.isPlatformAdmin && actor.profileId !== userId) {
      return err(new ForbiddenError('Cannot modify preferences for other users'));
    }

    const existing = await prefRepo.findByUserAndOrg(userId, input.organizationId);
    const now = timestamp();

    const entity: NotificationPreferencesEntity = {
      id: existing?.id ?? createId(),
      userId,
      organizationId: input.organizationId ?? existing?.organizationId ?? null,
      channelPreferences: input.channelPreferences ?? existing?.channelPreferences ?? {
        WHATSAPP: true,
        SMS: true,
        EMAIL: true,
        IN_APP: true,
      },
      categoryOptOuts: input.categoryOptOuts ?? existing?.categoryOptOuts ?? [],
      phoneNumber: input.phoneNumber !== undefined ? input.phoneNumber : existing?.phoneNumber ?? null,
      email: input.email !== undefined ? input.email : existing?.email ?? null,
      quietHoursStart: input.quietHoursStart !== undefined ? input.quietHoursStart : existing?.quietHoursStart ?? null,
      quietHoursEnd: input.quietHoursEnd !== undefined ? input.quietHoursEnd : existing?.quietHoursEnd ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const saved = await prefRepo.save(entity);
    return ok(saved);
  }

  /**
   * Fetches preferences for a user.
   */
  async getPreferences(
    actor: ActorContext,
    userId: string,
    organizationId?: string,
  ): Promise<Result<NotificationPreferencesEntity | null, Error>> {
    const prefRepo = this.repos.notificationPreferences;
    if (!prefRepo) return err(new ValidationError('Preferences repository not configured'));

    if (!actor.isPlatformAdmin && actor.profileId !== userId) {
      return err(new ForbiddenError('Cannot view preferences for other users'));
    }

    const prefs = await prefRepo.findByUserAndOrg(userId, organizationId);
    return ok(prefs);
  }

  /**
   * Simulates provider delivery worker processing pending queue items with backoff and DLQ.
   */
  async processQueue(
    actor: ActorContext,
    mockDeliveryHandler?: (item: NotificationDispatchQueueEntity) => Promise<{ success: boolean; providerMessageId?: string; error?: string }>,
  ): Promise<Result<{ processed: number; delivered: number; failed: number; deadLetter: number }, Error>> {
    const queueRepo = this.repos.notificationQueue;
    if (!queueRepo) return err(new ValidationError('Queue repository not configured'));

    const pending = await queueRepo.findPending();
    let delivered = 0;
    let failed = 0;
    let deadLetter = 0;

    for (const item of pending) {
      const now = timestamp();
      try {
        const handler = mockDeliveryHandler ?? (async () => ({ success: true, providerMessageId: `prov-${createId()}` }));
        const result = await handler(item);

        if (result.success) {
          item.status = 'DELIVERED';
          item.providerMessageId = result.providerMessageId ?? null;
          item.deliveryConfirmedAt = now;
          item.claimedAt = null;
          item.claimedBy = null;
          item.leaseExpiresAt = null;
          item.updatedAt = now;
          delivered++;
        } else {
          item.retryCount++;
          item.errorLog.push({
            timestamp: now,
            error: result.error ?? 'Delivery failed',
            attempt: item.retryCount,
          });

          if (item.retryCount >= item.maxRetries) {
            item.status = 'DEAD_LETTER';
            deadLetter++;
          } else {
            item.status = 'PENDING';
            const backoffSeconds = calculateExponentialBackoff(item.retryCount);
            item.nextRetryAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();
            failed++;
          }
          item.claimedAt = null;
          item.claimedBy = null;
          item.leaseExpiresAt = null;
          item.updatedAt = now;
        }
      } catch (e: any) {
        item.retryCount++;
        item.errorLog.push({
          timestamp: now,
          error: e.message || 'Unknown network error',
          attempt: item.retryCount,
        });
        if (item.retryCount >= item.maxRetries) {
          item.status = 'DEAD_LETTER';
          deadLetter++;
        } else {
          item.status = 'PENDING';
          failed++;
        }
        item.claimedAt = null;
        item.claimedBy = null;
        item.leaseExpiresAt = null;
        item.updatedAt = now;
      }
      await queueRepo.save(item);
    }

    return ok({
      processed: pending.length,
      delivered,
      failed,
      deadLetter,
    });
  }

  /**
   * Handles incoming provider webhook (e.g. WAHA status callback) with cryptographic signature validation.
   */
  async handleProviderWebhook(
    actor: ActorContext,
    params: {
      rawPayload: string;
      signature: string;
      secret: string;
      timestampMs: number;
      providerMessageId: string;
      eventStatus: 'DELIVERED' | 'READ' | 'FAILED';
      errorReason?: string;
    },
  ): Promise<Result<{ verified: boolean; updated: boolean }, Error>> {
    const isValid = validateProviderWebhookSignature(
      params.rawPayload,
      params.signature,
      params.secret,
      params.timestampMs,
    );

    if (!isValid) {
      return err(new ValidationError('Invalid webhook signature or replay timestamp'));
    }

    const queueRepo = this.repos.notificationQueue;
    if (!queueRepo) return ok({ verified: true, updated: false });

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

    const now = timestamp();
    if (params.eventStatus === 'DELIVERED' || params.eventStatus === 'READ') {
      item.status = 'DELIVERED';
      item.deliveryConfirmedAt = now;
      item.updatedAt = now;
    } else if (params.eventStatus === 'FAILED') {
      item.status = 'DEAD_LETTER';
      item.errorLog.push({
        timestamp: now,
        error: params.errorReason || 'Provider webhook delivery failed',
        attempt: item.retryCount,
        category: 'PERMANENT',
      });
      item.updatedAt = now;
    }

    await queueRepo.save(item);
    return ok({ verified: true, updated: true });
  }

  /**
   * Registers a new notification template (Platform Admin only).
   */
  async registerTemplate(
    actor: ActorContext,
    template: Omit<NotificationTemplateEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Result<NotificationTemplateEntity, Error>> {
    if (!actor.isPlatformAdmin) {
      return err(new ForbiddenError('Only platform admin can register notification templates'));
    }

    const templateRepo = this.repos.notificationTemplates;
    if (!templateRepo) return err(new ValidationError('Templates repository not configured'));

    const now = timestamp();
    const entity: NotificationTemplateEntity = {
      ...template,
      id: createId(),
      createdAt: now,
      updatedAt: now,
    };

    const saved = await templateRepo.save(entity);
    return ok(saved);
  }
}
