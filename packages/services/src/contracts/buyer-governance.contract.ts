/**
 * OTP Next — Buyer Governance Contracts (RWA & MSME)
 * Modules 04, 05
 */

import type { Result } from '../types/result';
import type { ServiceError } from '../types/errors';
import type { ActorContext } from '../types/actor-context';

// ==========================================
// Module 04: RWA Governance
// ==========================================

export type RwaMemberRole = 'RESIDENT_OWNER' | 'COMMITTEE_MEMBER' | 'ESTATE_FACILITY_MANAGER';
export type CommitteeSeat = 'PRESIDENT' | 'SECRETARY' | 'TREASURER' | 'MEMBER';

export interface RwaAssociationDto {
  organizationId: string;
  name: string;
  registrationNumber: string;
  totalUnits: number;
  occupiedUnits: number;
  pincode: string;
  tenureStartYear: number;
  tenureEndYear: number;
  isActive: boolean;
}

export interface RwaCommitteeMemberDto {
  memberId: string;
  profileId: string;
  fullName: string;
  seat: CommitteeSeat;
  hasVotingPower: boolean;
  canApproveAwards: boolean;
  tenureExpiresAt: string;
}

export interface AssignCommitteeMemberInput {
  organizationId: string;
  targetProfileId: string;
  seat: CommitteeSeat;
  tenureYears?: number; // Defaults to 1 calendar year
}

export interface AssignEstateManagerInput {
  organizationId: string;
  targetProfileId: string;
  agencyName?: string;
  validUntil: string;
}

export interface RwaGovernanceContract {
  getAssociationDetails(actor: ActorContext, organizationId: string): Promise<Result<RwaAssociationDto, ServiceError>>;
  listCommitteeMembers(actor: ActorContext, organizationId: string): Promise<Result<RwaCommitteeMemberDto[], ServiceError>>;
  assignCommitteeMember(actor: ActorContext, input: AssignCommitteeMemberInput): Promise<Result<RwaCommitteeMemberDto, ServiceError>>;
  assignEstateManager(actor: ActorContext, input: AssignEstateManagerInput): Promise<Result<{ success: boolean; permissions: string[] }, ServiceError>>;
  verifyApprovalEligibility(actor: ActorContext, organizationId: string): Promise<Result<{ isEligible: boolean; reason?: string }, ServiceError>>;
}

// ==========================================
// Module 05: MSME Management & Delegation
// ==========================================

export interface MsmeEntityDto {
  organizationId: string;
  legalEntityName: string;
  gstin: string;
  pan: string;
  authorizedSignatoryProfileId: string;
  registeredPincode: string;
  activeDelegatesCount: number;
}

export interface MsmeDelegateDto {
  delegateId: string;
  profileId: string;
  fullName: string;
  email: string;
  spendLimitInRupees: number;
  canCreateRfq: boolean;
  canApprovePo: boolean;
  status: 'ACTIVE' | 'SUSPENDED';
}

export interface InviteDelegateInput {
  organizationId: string;
  delegateEmail: string;
  delegateName: string;
  spendLimitInRupees: number;
  canCreateRfq: boolean;
  canApprovePo: boolean;
}

export interface UpdateSpendThresholdInput {
  organizationId: string;
  delegateId: string;
  newSpendLimitInRupees: number;
}

export interface MsmeManagementContract {
  getMsmeEntity(actor: ActorContext, organizationId: string): Promise<Result<MsmeEntityDto, ServiceError>>;
  listDelegates(actor: ActorContext, organizationId: string): Promise<Result<MsmeDelegateDto[], ServiceError>>;
  inviteDelegate(actor: ActorContext, input: InviteDelegateInput): Promise<Result<MsmeDelegateDto, ServiceError>>;
  updateSpendThreshold(actor: ActorContext, input: UpdateSpendThresholdInput): Promise<Result<MsmeDelegateDto, ServiceError>>;
  revokeDelegate(actor: ActorContext, organizationId: string, delegateId: string): Promise<Result<{ revoked: boolean }, ServiceError>>;
}
