/**
 * OTP Next — Communications & Document Contracts (Notifications & Storage)
 * Modules 23, 24
 */

import type { Result } from '../types/result';
import type { ServiceError } from '../types/errors';
import type { ActorContext } from '../types/actor-context';

// ==========================================
// Module 23: Notification Management
// ==========================================

export type ModularNotificationChannel = 'IN_APP' | 'WHATSAPP' | 'EMAIL';
export type NotificationPriority = 'CRITICAL' | 'HIGH' | 'NORMAL';

export interface InAppNotificationDto {
  notificationId: string;
  recipientProfileId: string;
  title: string;
  body: string;
  priority: NotificationPriority;
  actionUrl?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface ModularDispatchNotificationInput {
  recipientProfileId: string;
  title: string;
  body: string;
  channels: ModularNotificationChannel[];
  priority?: NotificationPriority;
  actionUrl?: string;
}

export interface NotificationManagementContract {
  listInAppNotifications(actor: ActorContext, limit?: number): Promise<Result<InAppNotificationDto[], ServiceError>>;
  markNotificationAsRead(actor: ActorContext, notificationId: string): Promise<Result<{ success: boolean }, ServiceError>>;
  markAllAsRead(actor: ActorContext): Promise<Result<{ success: boolean }, ServiceError>>;
  dispatchNotification(input: ModularDispatchNotificationInput): Promise<Result<{ dispatchedCount: number }, ServiceError>>;
}

// ==========================================
// Module 24: Document & Attachment Management
// ==========================================

export interface DocumentAttachmentDto {
  attachmentId: string;
  entityType: 'RFQ' | 'QUOTE' | 'PO' | 'INVOICE' | 'KYC';
  entityId: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  storagePath: string;
  uploadedAt: string;
}

export interface GenerateUploadUrlInput {
  entityType: 'RFQ' | 'QUOTE' | 'PO' | 'INVOICE' | 'KYC';
  entityId: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
}

export interface DocumentManagementContract {
  generateUploadUrl(actor: ActorContext, input: GenerateUploadUrlInput): Promise<Result<{
    uploadUrl: string;
    attachmentId: string;
    storagePath: string;
  }, ServiceError>>;
  generateDownloadUrl(actor: ActorContext, attachmentId: string): Promise<Result<{ downloadUrl: string; expiresInSeconds: number }, ServiceError>>;
  listAttachmentsForEntity(actor: ActorContext, entityType: string, entityId: string): Promise<Result<DocumentAttachmentDto[], ServiceError>>;
}
