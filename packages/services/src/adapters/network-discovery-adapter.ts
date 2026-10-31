/**
 * OTP Next — Supplier Network & Invitations Adapters
 */

import type { TypedSupabaseClient } from '@otp/database';
import type {
  SupplierNetworkEngineContract,
  SupplierInvitationsContract,
  NetworkDiscoveryRequest,
  NetworkDiscoverySummaryDto,
  RfqInvitationDto,
  MatchAndInviteInput,
  RespondToInvitationInput,
} from '../contracts/network-discovery.contract';
import type { ActorContext } from '../types/actor-context';
import { ok, type Result } from '../types/result';
import { ServiceError } from '../types/errors';

export class SupabaseNetworkEngineAdapter implements SupplierNetworkEngineContract {
  constructor(private _client: TypedSupabaseClient | any) {}

  async getNetworkCoverage(pincode: string, _categoryId: string): Promise<Result<NetworkDiscoverySummaryDto, ServiceError>> {
    return ok({
      pincode,
      totalSuppliersFound: 18,
      localRegistryCount: 6,
      googlePlacesCount: 10,
      ondcCount: 2,
      isCoverageFresh: true,
      refreshedAt: new Date().toISOString(),
    });
  }

  async triggerDiscovery(_actor: ActorContext, request: NetworkDiscoveryRequest): Promise<Result<NetworkDiscoverySummaryDto, ServiceError>> {
    return this.getNetworkCoverage(request.pincode, request.categoryId);
  }

  async preWarmCoverage(actor: ActorContext, pincode: string, categoryId: string): Promise<Result<NetworkDiscoverySummaryDto, ServiceError>> {
    return this.getNetworkCoverage(pincode, categoryId);
  }
}

export class SupabaseSupplierInvitationsAdapter implements SupplierInvitationsContract {
  constructor(private _client: TypedSupabaseClient | any) {}

  async listInvitationsForRfq(_actor: ActorContext, rfqId: string): Promise<Result<RfqInvitationDto[], ServiceError>> {
    return ok([
      {
        invitationId: 'inv_1',
        rfqId,
        supplierId: 'sup_alpha',
        status: 'ACCEPTED',
        channel: 'WHATSAPP',
        invitationToken: 'tok_abc123',
        sentAt: '2026-03-01T10:00:00Z',
        respondedAt: '2026-03-01T10:15:00Z',
      },
      {
        invitationId: 'inv_2',
        rfqId,
        supplierId: 'sup_beta',
        status: 'PENDING',
        channel: 'OTP_PORTAL',
        invitationToken: 'tok_xyz456',
        sentAt: '2026-03-01T10:00:00Z',
        respondedAt: null,
      },
    ]);
  }

  async matchAndInvite(_actor: ActorContext, _input: MatchAndInviteInput): Promise<Result<{ invitedCount: number }, ServiceError>> {
    return ok({ invitedCount: 5 });
  }

  async respondToInvitation(input: RespondToInvitationInput): Promise<Result<{ status: string }, ServiceError>> {
    return ok({ status: input.action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED' });
  }

  async getInvitationByToken(token: string): Promise<Result<RfqInvitationDto, ServiceError>> {
    return ok({
      invitationId: 'inv_' + token,
      rfqId: 'rfq_sample',
      supplierId: 'sup_invited',
      status: 'PENDING',
      channel: 'WHATSAPP',
      invitationToken: token,
      sentAt: new Date().toISOString(),
      respondedAt: null,
    });
  }
}
