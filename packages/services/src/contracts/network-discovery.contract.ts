/**
 * OTP Next — Supplier Network & Invitations Contracts
 * Modules 10, 12
 */

import type { Result } from '../types/result';
import type { ServiceError } from '../types/errors';
import type { ActorContext } from '../types/actor-context';

// ==========================================
// Module 10: Supplier Network Engine
// ==========================================

export interface NetworkDiscoveryRequest {
  pincode: string;
  categoryId: string;
  subcategoryId?: string;
  radiusKm?: number;
}

export interface NetworkDiscoverySummaryDto {
  pincode: string;
  totalSuppliersFound: number;
  localRegistryCount: number;
  googlePlacesCount: number;
  ondcCount: number;
  isCoverageFresh: boolean;
  refreshedAt: string;
}

export interface SupplierNetworkEngineContract {
  getNetworkCoverage(pincode: string, categoryId: string): Promise<Result<NetworkDiscoverySummaryDto, ServiceError>>;
  triggerDiscovery(actor: ActorContext, request: NetworkDiscoveryRequest): Promise<Result<NetworkDiscoverySummaryDto, ServiceError>>;
  preWarmCoverage(actor: ActorContext, pincode: string, categoryId: string): Promise<Result<NetworkDiscoverySummaryDto, ServiceError>>;
}

// ==========================================
// Module 12: Supplier Matching & Invitations
// ==========================================

export interface RfqInvitationDto {
  invitationId: string;
  rfqId: string;
  supplierId: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  channel: 'OTP_PORTAL' | 'WHATSAPP' | 'EMAIL';
  invitationToken: string;
  sentAt: string;
  respondedAt?: string | null;
}

export interface MatchAndInviteInput {
  rfqId: string;
  maxSuppliers?: number;
}

export interface RespondToInvitationInput {
  invitationToken: string;
  action: 'ACCEPT' | 'DECLINE';
  declineReason?: string;
}

export interface SupplierInvitationsContract {
  listInvitationsForRfq(actor: ActorContext, rfqId: string): Promise<Result<RfqInvitationDto[], ServiceError>>;
  matchAndInvite(actor: ActorContext, input: MatchAndInviteInput): Promise<Result<{ invitedCount: number }, ServiceError>>;
  respondToInvitation(input: RespondToInvitationInput): Promise<Result<{ status: string }, ServiceError>>;
  getInvitationByToken(token: string): Promise<Result<RfqInvitationDto, ServiceError>>;
}
