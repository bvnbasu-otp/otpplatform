import type { IdentityProtectedQuote, RevealedQuote } from '@otp/domain';
import type { IdentityProtectedInvitation } from '../mappers/blind-invitation-mapper';
import type { ManagerInvitation } from '../mappers/manager-invitation-mapper';

export interface IdentityProtectedQuoteRepository {
  findByRfqId(rfqId: string): Promise<IdentityProtectedQuote[]>;
}

export interface RevealedQuoteRepository {
  findByRfqId(rfqId: string): Promise<RevealedQuote[]>;
}

export interface IdentityProtectedInvitationRepository {
  findByRfqId(rfqId: string): Promise<IdentityProtectedInvitation[]>;
}

export interface ManagerInvitationRepository {
  findByRfqId(rfqId: string): Promise<ManagerInvitation[]>;
}

export interface IdentityProtectedViewRepositories {
  identityProtectedQuotes: IdentityProtectedQuoteRepository;
  revealedQuotes: RevealedQuoteRepository;
  identityProtectedInvitations: IdentityProtectedInvitationRepository;
  managerInvitations: ManagerInvitationRepository;
}

// Legacy aliases
export type BlindQuoteRepository = IdentityProtectedQuoteRepository;
export type BlindInvitationRepository = IdentityProtectedInvitationRepository;
export type BlindViewRepositories = IdentityProtectedViewRepositories;

export interface RfqRevealStatusReader {
  getRevealStatus(rfqId: string): Promise<'PROTECTED' | 'REVEALED' | 'BLIND' | null>;
}

export type { BuyerAddressRepository } from './supabase-buyer-address-repository';
export type { OrgRoleLifecycleRepository } from './supabase-org-role-lifecycle-repository';
