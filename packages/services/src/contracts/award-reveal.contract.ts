/**
 * OTP Next — Award & Identity Reveal Contracts
 * Module 17
 */

import type { Result } from '../types/result';
import type { ServiceError } from '../types/errors';
import type { ActorContext } from '../types/actor-context';

export interface AwardNoticeDto {
  awardId: string;
  rfqId: string;
  quoteId: string;
  status: 'PENDING_SUPPLIER_ACCEPTANCE' | 'ACCEPTED' | 'REJECTED' | 'REVEALED';
  awardedAmount: number;
  awardedAt: string;
}

export interface RevealedSupplierIdentityDto {
  supplierId: string;
  businessName: string;
  contactPersonName: string;
  contactPhone: string;
  contactEmail: string;
  operatingAddress: string;
  gstin: string;
  pan: string;
  bankDetailsVerified: boolean;
}

export interface RevealedBuyerIdentityDto {
  buyerProfileId: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string;
  deliveryAddress: string;
  organizationName?: string | null;
}

export interface FullAwardRevealDto {
  awardId: string;
  rfqId: string;
  quoteId: string;
  supplier: RevealedSupplierIdentityDto;
  buyer: RevealedBuyerIdentityDto;
  totalAgreedLandedCost: number;
  revealedAt: string;
}

export interface IssueAwardInput {
  rfqId: string;
  selectedQuoteId: string;
  notes?: string;
}

export interface AcceptAwardInput {
  awardId: string;
  confirmPlatformFeeTerm: boolean; // 0.50% fee check
}

export interface AwardRevealContract {
  issueAwardNotice(actor: ActorContext, input: IssueAwardInput): Promise<Result<AwardNoticeDto, ServiceError>>;
  acceptAward(actor: ActorContext, input: AcceptAwardInput): Promise<Result<AwardNoticeDto, ServiceError>>;
  executeAtomicReveal(actor: ActorContext, awardId: string): Promise<Result<FullAwardRevealDto, ServiceError>>;
  getAwardRevealDetails(actor: ActorContext, rfqId: string): Promise<Result<FullAwardRevealDto, ServiceError>>;
}
