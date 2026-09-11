import type { IdentityProtectedQuote, RevealedQuote } from '@otp/domain';
import type { BlindInvitation } from './blind-invitation';
import type { ManagerInvitation } from './manager-invitation';

export interface IdentityProtectedQuoteReadRepository {
  findByRfqId(rfqId: string): Promise<IdentityProtectedQuote[]>;
}

// Legacy alias
export type BlindQuoteReadRepository = IdentityProtectedQuoteReadRepository;

export interface RevealedQuoteReadRepository {
  findByRfqId(rfqId: string): Promise<RevealedQuote[]>;
}

export interface BlindInvitationReadRepository {
  findByRfqId(rfqId: string): Promise<BlindInvitation[]>;
}

export interface ManagerInvitationReadRepository {
  findByRfqId(rfqId: string): Promise<ManagerInvitation[]>;
}

export interface RfqRevealStatusPort {
  getRevealStatus(rfqId: string): Promise<'PROTECTED' | 'REVEALED' | 'BLIND' | null>;
}

export interface BlindViewPorts {
  blindQuotes: BlindQuoteReadRepository;
  revealedQuotes: RevealedQuoteReadRepository;
  blindInvitations: BlindInvitationReadRepository;
  managerInvitations: ManagerInvitationReadRepository;
  rfqRevealStatus: RfqRevealStatusPort;
}
