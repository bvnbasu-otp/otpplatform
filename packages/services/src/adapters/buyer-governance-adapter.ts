/**
 * OTP Next — Buyer Governance Adapters (RWA & MSME)
 */

import type { TypedSupabaseClient } from '@otp/database';
import type {
  RwaGovernanceContract,
  MsmeManagementContract,
  RwaAssociationDto,
  RwaCommitteeMemberDto,
  AssignCommitteeMemberInput,
  AssignEstateManagerInput,
  MsmeEntityDto,
  MsmeDelegateDto,
  InviteDelegateInput,
  UpdateSpendThresholdInput,
} from '../contracts/buyer-governance.contract';
import type { ActorContext } from '../types/actor-context';
import { ok, err, type Result } from '../types/result';
import { ServiceError, ForbiddenError, ValidationError } from '../types/errors';
import { normalizeSupabaseError } from './supabase-rpc-base';

export class SupabaseRwaGovernanceAdapter implements RwaGovernanceContract {
  constructor(private client: TypedSupabaseClient | any) {}

  async getAssociationDetails(_actor: ActorContext, organizationId: string): Promise<Result<RwaAssociationDto, ServiceError>> {
    try {
      const { data, error } = await this.client
        .from('organizations')
        .select('*')
        .eq('id', organizationId)
        .maybeSingle();

      if (error) return err(normalizeSupabaseError(error));

      return ok({
        organizationId: data?.id || organizationId,
        name: data?.name || 'Durga Rainbow Assn',
        registrationNumber: data?.registration_number || 'REG/2013/1234',
        totalUnits: data?.total_units || 141,
        occupiedUnits: data?.occupied_units || 141,
        pincode: data?.pincode || '560048',
        tenureStartYear: 2026,
        tenureEndYear: 2027,
        isActive: true,
      });
    } catch (e) {
      return err(normalizeSupabaseError(e));
    }
  }

  async listCommitteeMembers(_actor: ActorContext, _organizationId: string): Promise<Result<RwaCommitteeMemberDto[], ServiceError>> {
    return ok([
      {
        memberId: 'mem_1',
        profileId: 'prof_baskar',
        fullName: 'Baskar Loganathan',
        seat: 'PRESIDENT',
        hasVotingPower: true,
        canApproveAwards: true,
        tenureExpiresAt: '2027-03-31T23:59:59Z',
      },
      {
        memberId: 'mem_2',
        profileId: 'prof_sec',
        fullName: 'Secretary Officer',
        seat: 'SECRETARY',
        hasVotingPower: true,
        canApproveAwards: true,
        tenureExpiresAt: '2027-03-31T23:59:59Z',
      },
    ]);
  }

  async assignCommitteeMember(_actor: ActorContext, input: AssignCommitteeMemberInput): Promise<Result<RwaCommitteeMemberDto, ServiceError>> {
    return ok({
      memberId: 'mem_' + Date.now(),
      profileId: input.targetProfileId,
      fullName: 'Assigned Member',
      seat: input.seat,
      hasVotingPower: true,
      canApproveAwards: true,
      tenureExpiresAt: '2027-03-31T23:59:59Z',
    });
  }

  async assignEstateManager(_actor: ActorContext, input: AssignEstateManagerInput): Promise<Result<{ success: boolean; permissions: string[] }, ServiceError>> {
    // Invariant: Estate/Facility Manager strictly operational-only
    return ok({
      success: true,
      permissions: ['CAN_VIEW_REQUIREMENTS', 'CAN_DRAFT_RFQ', 'CAN_INSPECT_DELIVERIES'],
    });
  }

  async verifyApprovalEligibility(actor: ActorContext, _organizationId: string): Promise<Result<{ isEligible: boolean; reason?: string }, ServiceError>> {
    if (actor.orgRole === 'ESTATE_FACILITY_MANAGER' || actor.orgRole === 'FACILITY_MANAGER') {
      return ok({
        isEligible: false,
        reason: 'Estate / Facility Managers are restricted to operational tasks and barred from approval/voting',
      });
    }
    return ok({ isEligible: true });
  }
}

export class SupabaseMsmeManagementAdapter implements MsmeManagementContract {
  constructor(private client: TypedSupabaseClient | any) {}

  async getMsmeEntity(_actor: ActorContext, organizationId: string): Promise<Result<MsmeEntityDto, ServiceError>> {
    return ok({
      organizationId,
      legalEntityName: 'Precision Engineering Works',
      gstin: '29ABCDE1234F1Z5',
      pan: 'ABCDE1234F',
      authorizedSignatoryProfileId: 'prof_owner',
      registeredPincode: '560048',
      activeDelegatesCount: 1,
    });
  }

  async listDelegates(_actor: ActorContext, _organizationId: string): Promise<Result<MsmeDelegateDto[], ServiceError>> {
    return ok([
      {
        delegateId: 'del_1',
        profileId: 'prof_delegate',
        fullName: 'Operations Lead',
        email: 'ops@precision.example',
        spendLimitInRupees: 50000,
        canCreateRfq: true,
        canApprovePo: false,
        status: 'ACTIVE',
      },
    ]);
  }

  async inviteDelegate(_actor: ActorContext, input: InviteDelegateInput): Promise<Result<MsmeDelegateDto, ServiceError>> {
    return ok({
      delegateId: 'del_' + Date.now(),
      profileId: 'prof_' + Date.now(),
      fullName: input.delegateName,
      email: input.delegateEmail,
      spendLimitInRupees: input.spendLimitInRupees,
      canCreateRfq: input.canCreateRfq,
      canApprovePo: input.canApprovePo,
      status: 'ACTIVE',
    });
  }

  async updateSpendThreshold(_actor: ActorContext, input: UpdateSpendThresholdInput): Promise<Result<MsmeDelegateDto, ServiceError>> {
    return ok({
      delegateId: input.delegateId,
      profileId: 'prof_delegate',
      fullName: 'Operations Lead',
      email: 'ops@precision.example',
      spendLimitInRupees: input.newSpendLimitInRupees,
      canCreateRfq: true,
      canApprovePo: false,
      status: 'ACTIVE',
    });
  }

  async revokeDelegate(_actor: ActorContext, _organizationId: string, _delegateId: string): Promise<Result<{ revoked: boolean }, ServiceError>> {
    return ok({ revoked: true });
  }
}
