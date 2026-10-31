/**
 * OTP Next — Communications & Document Adapters
 * Modules 23, 24
 */

import type { TypedSupabaseClient } from '@otp/database';
import type {
  NotificationManagementContract,
  DocumentManagementContract,
  InAppNotificationDto,
  ModularDispatchNotificationInput,
  DocumentAttachmentDto,
  GenerateUploadUrlInput,
} from '../contracts/communications-docs.contract';
import type { ActorContext } from '../types/actor-context';
import { ok, type Result } from '../types/result';
import { ServiceError } from '../types/errors';

export class SupabaseNotificationAdapter implements NotificationManagementContract {
  constructor(private _client: TypedSupabaseClient | any) {}

  async listInAppNotifications(actor: ActorContext, _limit?: number): Promise<Result<InAppNotificationDto[], ServiceError>> {
    return ok([
      {
        notificationId: 'notif_1',
        recipientProfileId: actor.profileId,
        title: 'New Quote Received',
        body: 'Supplier Alpha submitted a quotation for DG Set Annual Maintenance.',
        priority: 'HIGH',
        actionUrl: '/quotes/quote_alpha',
        isRead: false,
        createdAt: '2026-03-02T11:05:00Z',
      },
      {
        notificationId: 'notif_2',
        recipientProfileId: actor.profileId,
        title: 'Award Acceptance Required',
        body: 'Please review and accept terms to finalize PO issuance.',
        priority: 'CRITICAL',
        actionUrl: '/awards/award_sample_01',
        isRead: false,
        createdAt: '2026-03-05T09:00:00Z',
      },
    ]);
  }

  async markNotificationAsRead(_actor: ActorContext, _notificationId: string): Promise<Result<{ success: boolean }, ServiceError>> {
    return ok({ success: true });
  }

  async markAllAsRead(_actor: ActorContext): Promise<Result<{ success: boolean }, ServiceError>> {
    return ok({ success: true });
  }

  async dispatchNotification(input: ModularDispatchNotificationInput): Promise<Result<{ dispatchedCount: number }, ServiceError>> {
    return ok({ dispatchedCount: input.channels.length });
  }
}

export class SupabaseDocumentAdapter implements DocumentManagementContract {
  constructor(private _client: TypedSupabaseClient | any) {}

  async generateUploadUrl(_actor: ActorContext, input: GenerateUploadUrlInput): Promise<Result<{
    uploadUrl: string;
    attachmentId: string;
    storagePath: string;
  }, ServiceError>> {
    const attachmentId = 'att_' + Date.now();
    const storagePath = `${input.entityType.toLowerCase()}/${input.entityId}/${input.fileName}`;
    return ok({
      uploadUrl: `https://storage.otp.local/upload/${storagePath}`,
      attachmentId,
      storagePath,
    });
  }

  async generateDownloadUrl(_actor: ActorContext, attachmentId: string): Promise<Result<{ downloadUrl: string; expiresInSeconds: number }, ServiceError>> {
    return ok({
      downloadUrl: `https://storage.otp.local/download/${attachmentId}`,
      expiresInSeconds: 3600,
    });
  }

  async listAttachmentsForEntity(_actor: ActorContext, entityType: string, entityId: string): Promise<Result<DocumentAttachmentDto[], ServiceError>> {
    return ok([
      {
        attachmentId: 'att_1',
        entityType: entityType as any,
        entityId,
        fileName: 'technical_specifications.pdf',
        fileSizeBytes: 245000,
        mimeType: 'application/pdf',
        storagePath: `${entityType.toLowerCase()}/${entityId}/technical_specifications.pdf`,
        uploadedAt: '2026-03-01T09:15:00Z',
      },
    ]);
  }
}
